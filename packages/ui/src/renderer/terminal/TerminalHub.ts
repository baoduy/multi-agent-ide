/**
 * TerminalHub — module-level, React-free registry of xterm instances.
 *
 * Why this exists:
 *   React re-renders, tab switches, parent remounts MUST NOT dispose xterm
 *   instances or disturb the backend session. The hub owns xterm lifecycle
 *   outside React entirely. A React component (`TerminalView`) just attaches
 *   the xterm's DOM into a ref'd div on mount, and detaches on unmount.
 *
 * What it handles:
 *   - One xterm per session, persisted across mounts/unmounts.
 *   - Replay on attach via `terminal:attach` / `ai-session:attach` IPC.
 *   - Live chunk delivery with seq tracking (for reattach after reloads).
 *   - Input forwarding to the backend PTY.
 *   - Resize debouncing + FitAddon integration.
 *   - Acks to the daemon (flow-control signal).
 *   - Heartbeat-based reconnect ("reconnecting…" banner after 2 missed beats).
 *
 * The hub is intentionally mode-agnostic: callers pass a `TerminalAdapter`
 * that knows how to talk to either the shell or AI-session endpoints.
 */

import { Terminal as XTerm, type IDisposable } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import xtermCss from "@xterm/xterm/css/xterm.css";

import { TERMINAL_THEMES } from "../utils/terminalThemes";
import { sendOrThrow, onEvent } from "../services/ipcClient";

export type TerminalMode = "shell" | "ai-agent";

export interface TerminalHubOptions {
  fontFamily?: string;
  fontSize?: number;
  /** Ring-replay threshold below which we don't `clear()` before writing. */
  snapshotClearsScreen?: boolean;
}

const DEFAULT_OPTS: Required<TerminalHubOptions> = {
  fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
  fontSize: 11,
  snapshotClearsScreen: true,
};

const THEME = TERMINAL_THEMES.dark;

let xtermStylesInjected = false;
function ensureXtermStyles(): void {
  if (xtermStylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-magenta-xterm", "true");
  style.textContent = xtermCss;
  document.head.appendChild(style);
  xtermStylesInjected = true;
}

/** Per-session state kept alive for the lifetime of the session. */
interface HubEntry {
  sessionId: string;
  mode: TerminalMode;
  xterm: XTerm;
  fitAddon: FitAddon;
  /** Persistent container element — xterm is always opened here. */
  host: HTMLDivElement;
  /** Currently-visible parent div (or null if detached). */
  mountedIn: HTMLElement | null;
  /** Monotonic seq of the newest chunk we have applied to xterm. */
  lastSeq: number;
  /** True once we've performed the initial attach/replay from daemon. */
  attached: boolean;
  /** Key input subscription. */
  inputDisposable: IDisposable;
  /** Resize debounce timer. */
  resizeTimer: ReturnType<typeof setTimeout> | null;
  /** Last reported cols/rows (to suppress no-op resize IPC). */
  lastCols: number;
  lastRows: number;
  /** Last heartbeat timestamp from daemon (Date.now). */
  lastHeartbeatAt: number;
  /** When this entry was created — used for a startup grace window. */
  createdAt: number;
  /** Monotonically increasing count of consecutive stale sweeps. */
  staleTicks: number;
  /** Wall-clock time we last triggered a recovery attach. 0 = never. */
  lastAttachAt: number;
  /** Wall-clock time the banner was last shown. 0 = not showing. */
  bannerShownAt: number;
  /** "[reconnecting]" banner element, shown on missed heartbeats. */
  banner: HTMLDivElement | null;
  /** Optional exit-code banner element, shown when the session exits. */
  exitedBannerShown: boolean;
  /** Unsubscribers for global IPC event listeners (called on dispose). */
  unsubscribes: Array<() => void>;
}

/**
 * Reconnect-banner tuning. The daemon heartbeats at 2 s; we want to
 * tolerate IPC jitter without nagging the user. A single late heartbeat
 * should NEVER raise the banner.
 */
const STALE_THRESHOLD_MS = 12_000; // 6× heartbeat interval
const STALE_TICKS_REQUIRED = 2; // must be stale on two consecutive sweeps
const ATTACH_RECOVERY_COOLDOWN_MS = 5_000; // don't re-attach more than once per 5s
const STARTUP_GRACE_MS = 6_000; // freshly-created entries get a quiet window
const BANNER_MIN_VISIBLE_MS = 1_500; // if we do show it, keep it up this long

class TerminalHubImpl {
  private readonly entries = new Map<string, HubEntry>();
  private readonly options: Required<TerminalHubOptions>;

  /** Whether we've registered global IPC subscriptions. */
  private globalSubscribed = false;

  constructor(options: TerminalHubOptions = {}) {
    this.options = { ...DEFAULT_OPTS, ...options };
  }

  // ─── Public API ─────────────────────────────────────────────

  /**
   * Create (or look up) a terminal entry for the given session and mount its
   * xterm into `container`. Safe to call repeatedly for the same sessionId —
   * subsequent calls move the DOM, not recreate the xterm.
   */
  attach(sessionId: string, mode: TerminalMode, container: HTMLElement): void {
    ensureXtermStyles();
    this.ensureGlobalSubscriptions();

    let entry = this.entries.get(sessionId);
    if (!entry) {
      entry = this.createEntry(sessionId, mode);
      this.entries.set(sessionId, entry);
    }

    // Hide any other entries currently mounted in this same container — a
    // tab switch in the parent component should hide the outgoing terminal
    // without tearing it down (its session keeps running).
    for (const other of this.entries.values()) {
      if (other === entry) continue;
      if (other.mountedIn === container) {
        other.host.style.display = "none";
      }
    }

    // Mount (or re-mount) the persistent host inside the React-owned container.
    if (entry.host.parentNode !== container) {
      entry.host.parentNode?.removeChild(entry.host);
      container.appendChild(entry.host);
    }
    entry.host.style.display = "flex";
    entry.mountedIn = container;

    // Fit now that the host has a layout
    requestAnimationFrame(() => this.safeFit(entry!));

    // First-time attach → replay from daemon ring buffer
    if (!entry.attached) {
      entry.attached = true;
      void this.performAttach(entry);
    }
  }

  /** Called when the React view unmounts. Keeps xterm alive; just orphans the DOM. */
  detach(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    // Remove from DOM but keep xterm + state intact. The session is still
    // subscribed to IPC events and will accumulate output into xterm's
    // scrollback even while detached — so reattach is instantaneous.
    if (entry.host.parentNode) {
      entry.host.parentNode.removeChild(entry.host);
    }
    entry.mountedIn = null;
  }

  /** Permanent disposal — PTY has exited or session deleted. */
  dispose(sessionId: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    entry.inputDisposable.dispose();
    if (entry.resizeTimer) clearTimeout(entry.resizeTimer);
    for (const u of entry.unsubscribes) {
      try { u(); } catch { /* noop */ }
    }
    entry.xterm.dispose();
    entry.host.parentNode?.removeChild(entry.host);
    this.entries.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.entries.has(sessionId);
  }

  /** Imperative focus (for tab-switch code paths). */
  focus(sessionId: string): void {
    this.entries.get(sessionId)?.xterm.focus();
  }

  /** Re-fit all mounted terminals. Cheap — call on viewport/dock changes. */
  refitAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.mountedIn) this.safeFit(entry);
    }
  }

  /** Push text into the session's stdin (used by paste menus). */
  writeInput(sessionId: string, data: string): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    void this.sendInput(entry, data);
  }

  /** Clear the xterm buffer without touching the PTY. */
  clear(sessionId: string): void {
    this.entries.get(sessionId)?.xterm.clear();
  }

  /** Current selection (for Copy menu). */
  getSelection(sessionId: string): string {
    return this.entries.get(sessionId)?.xterm.getSelection() ?? "";
  }

  // ─── Internals ──────────────────────────────────────────────

  private createEntry(sessionId: string, mode: TerminalMode): HubEntry {
    // Persistent host element — lives outside React's virtual DOM entirely.
    const host = document.createElement("div");
    host.setAttribute("data-terminal-session", sessionId);
    host.style.flex = "1";
    host.style.minHeight = "0";
    host.style.position = "relative";
    host.style.width = "100%";
    host.style.height = "100%";
    // Small left inset for AI terminals — agent CLIs (Claude Code, Copilot)
    // render glyphs flush with column 0 which visually collides with the
    // panel's left edge/border. FitAddon accounts for padding when
    // computing cols, so this stays pixel-correct on resize.
    if (mode === "ai-agent") {
      host.style.paddingLeft = "2px";
    }

    const xterm = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily: this.options.fontFamily,
      fontSize: this.options.fontSize,
      lineHeight: 1.45,
      theme: THEME,
      scrollback: 10_000, // large scrollback, cheap with the canvas renderer
      // WebGL note: load `@xterm/addon-webgl` and `xterm.loadAddon(new WebglAddon())`
      // here if the dep is added. It is 5–10× faster than canvas for heavy output.
    });
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(host);

    const now = Date.now();
    const entry: HubEntry = {
      sessionId,
      mode,
      xterm,
      fitAddon,
      host,
      mountedIn: null,
      lastSeq: 0,
      attached: false,
      inputDisposable: { dispose: () => {} },
      resizeTimer: null,
      lastCols: 0,
      lastRows: 0,
      lastHeartbeatAt: now,
      createdAt: now,
      staleTicks: 0,
      lastAttachAt: 0,
      bannerShownAt: 0,
      banner: null,
      exitedBannerShown: false,
      unsubscribes: [],
    };

    // Keyboard shortcuts
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? event.metaKey : event.ctrlKey;

      // Shift+Enter → send CSI u escape sequence so CLI tools (Claude Code,
      // Copilot) treat it as "newline without submit" for multi-line prompts.
      if (event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        void this.sendInput(entry, "\x1b[13;2u");
        return false;
      }

      if (mod && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        xterm.clear();
        return false;
      }
      if (isMac && event.metaKey && !event.shiftKey && event.key.toLowerCase() === "c") {
        if (xterm.hasSelection()) {
          event.preventDefault();
          void navigator.clipboard.writeText(xterm.getSelection());
          return false;
        }
        return true;
      }
      if (
        (isMac && event.metaKey && event.key.toLowerCase() === "v") ||
        (!isMac && event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "v")
      ) {
        event.preventDefault();
        void navigator.clipboard.readText().then((text) => {
          if (text) void this.sendInput(entry, text);
        });
        return false;
      }
      return true;
    });

    // Forward keyboard → PTY
    entry.inputDisposable = xterm.onData((data) => {
      void this.sendInput(entry, data);
    });

    // Debounced resize observer — only on the host itself (not parents)
    const ro = new ResizeObserver(() => this.scheduleResize(entry));
    ro.observe(host);
    entry.unsubscribes.push(() => ro.disconnect());

    return entry;
  }

  private ensureGlobalSubscriptions(): void {
    if (this.globalSubscribed) return;
    this.globalSubscribed = true;

    // Shell terminal
    onEvent("terminal:data", (ev) => this.onChunk(ev.sessionId, ev.data, ev.seq ?? 0));
    onEvent("terminal:exited", (ev) => this.onExit(ev.sessionId, ev.exitCode));
    onEvent("terminal:heartbeat", (ev) => this.onHeartbeat(ev.sessionId, ev.alive, ev.headSeq));

    // AI session
    onEvent("ai-session:data", (ev) => this.onChunk(ev.sessionId, ev.data, ev.seq ?? 0));
    onEvent("ai-session:exited", (ev) => this.onExit(ev.sessionId, ev.exitCode));
    onEvent("ai-session:heartbeat", (ev) => this.onHeartbeat(ev.sessionId, ev.alive, ev.headSeq));

    // Missed-heartbeat reconnect sweeper (every second)
    setInterval(() => this.sweepStaleHeartbeats(), 1_000);
  }

  private async performAttach(entry: HubEntry): Promise<void> {
    try {
      if (entry.mode === "shell") {
        const res = await sendOrThrow({
          type: "terminal:attach",
          sessionId: entry.sessionId,
          fromSeq: entry.lastSeq,
        });
        this.applyAttachResult(entry, res.chunks, res.snapshot, res.headSeq, res.alive);
      } else {
        const res = await sendOrThrow({
          type: "ai-session:attach",
          sessionId: entry.sessionId,
          fromSeq: entry.lastSeq,
        });
        this.applyAttachResult(entry, res.chunks, res.snapshot, res.headSeq, res.alive);
      }
    } catch {
      // Daemon not ready yet or session doesn't exist — we'll keep receiving
      // live chunks from the `*:data` push events which are already
      // subscribed. No-op.
    }
  }

  private applyAttachResult(
    entry: HubEntry,
    chunks: Array<{ seq: number; data: string }>,
    snapshot: boolean,
    headSeq: number,
    alive: boolean,
  ): void {
    if (snapshot && this.options.snapshotClearsScreen) {
      entry.xterm.reset();
    }
    for (const c of chunks) {
      entry.xterm.write(c.data);
    }
    entry.lastSeq = Math.max(entry.lastSeq, headSeq);
    if (!alive && !entry.exitedBannerShown) {
      this.onExit(entry.sessionId, 0);
    }
    // Ack the head so the daemon knows we caught up
    if (headSeq > 0) void this.sendAck(entry, headSeq);
  }

  private onChunk(sessionId: string, data: string, seq: number): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    // Deduplicate: if seq is provided and already applied, skip.
    if (seq > 0 && seq <= entry.lastSeq) return;

    // If we haven't attached yet, hold the write: attach will replay everything.
    // (First-time renders always call attach which gives us the snapshot.)
    entry.xterm.write(data, () => {
      // xterm drained → ack back to daemon (flow-control signal)
      if (seq > 0) void this.sendAck(entry, seq);
    });
    if (seq > entry.lastSeq) entry.lastSeq = seq;
    // Any traffic from the daemon is proof-of-life → treat as a heartbeat.
    entry.lastHeartbeatAt = Date.now();
    entry.staleTicks = 0;
    this.clearReconnectBanner(entry);
  }

  private onExit(sessionId: string, exitCode: number): void {
    const entry = this.entries.get(sessionId);
    if (!entry || entry.exitedBannerShown) return;
    entry.exitedBannerShown = true;
    // A true exit is not "reconnecting" — kill any banner left over.
    this.clearReconnectBanner(entry);
    const color = exitCode === 0 ? "\x1b[32m" : "\x1b[31m";
    entry.xterm.write(`\r\n${color}[Session ended — exit code ${exitCode}]\x1b[0m\r\n`);
  }

  private onHeartbeat(sessionId: string, alive: boolean, _headSeq: number): void {
    const entry = this.entries.get(sessionId);
    if (!entry) return;
    entry.lastHeartbeatAt = Date.now();
    entry.staleTicks = 0;
    if (alive) this.clearReconnectBanner(entry);
  }

  /**
   * Sweep for silent sessions. The policy is intentionally forgiving:
   *
   *   1. Skip sessions still inside the startup grace window — the first
   *      heartbeat has to travel through daemon spawn + IPC init.
   *   2. Require two *consecutive* stale ticks, not just a single spike —
   *      one late heartbeat burst shouldn't flash UI.
   *   3. Throttle recovery attaches so we don't pile up IPC requests
   *      while waiting for the daemon to catch up.
   *   4. Keep the banner up for a minimum visible duration once shown,
   *      so it never "flashes" in and out within a single sweep cycle.
   */
  private sweepStaleHeartbeats(): void {
    const now = Date.now();
    for (const entry of this.entries.values()) {
      if (entry.exitedBannerShown) continue;
      if (!entry.mountedIn) continue;
      if (now - entry.createdAt < STARTUP_GRACE_MS) continue;

      const silentFor = now - entry.lastHeartbeatAt;
      if (silentFor > STALE_THRESHOLD_MS) {
        entry.staleTicks += 1;
      } else {
        entry.staleTicks = 0;
      }

      if (entry.staleTicks >= STALE_TICKS_REQUIRED) {
        // this.showReconnectBanner(entry); // banner disabled — re-enable if you want a visible indicator
        if (now - entry.lastAttachAt > ATTACH_RECOVERY_COOLDOWN_MS) {
          entry.lastAttachAt = now;
          void this.performAttach(entry);
        }
      }
    }
  }

  private showReconnectBanner(entry: HubEntry): void {
    if (entry.banner || !entry.mountedIn) return;
    const b = document.createElement("div");
    b.textContent = "reconnecting…";
    entry.host.appendChild(b);
    entry.banner = b;
    entry.bannerShownAt = Date.now();
  }

  private clearReconnectBanner(entry: HubEntry): void {
    if (!entry.banner) return;
    // Respect a minimum on-screen time so a transient blip can't produce
    // a sub-second flash. If we're asked to clear too soon, schedule the
    // removal for later — subsequent clear calls coalesce on the timer.
    const shownFor = Date.now() - entry.bannerShownAt;
    if (shownFor < BANNER_MIN_VISIBLE_MS) {
      const delay = BANNER_MIN_VISIBLE_MS - shownFor;
      const banner = entry.banner;
      entry.banner = null; // prevent duplicate-removal if another clear fires
      setTimeout(() => {
        banner.parentNode?.removeChild(banner);
      }, delay);
      return;
    }
    entry.banner.parentNode?.removeChild(entry.banner);
    entry.banner = null;
  }

  private scheduleResize(entry: HubEntry): void {
    if (entry.resizeTimer) clearTimeout(entry.resizeTimer);
    entry.resizeTimer = setTimeout(() => {
      entry.resizeTimer = null;
      this.safeFit(entry);
      const cols = entry.xterm.cols;
      const rows = entry.xterm.rows;
      if (cols <= 0 || rows <= 0) return;
      if (cols === entry.lastCols && rows === entry.lastRows) return;
      entry.lastCols = cols;
      entry.lastRows = rows;
      void this.sendResize(entry, cols, rows);
    }, 120);
  }

  private safeFit(entry: HubEntry): void {
    try { entry.fitAddon.fit(); } catch { /* noop */ }
  }

  // ─── IPC calls (mode-aware) ─────────────────────────────────

  private async sendInput(entry: HubEntry, data: string): Promise<void> {
    try {
      if (entry.mode === "shell") {
        await sendOrThrow({ type: "terminal:input", sessionId: entry.sessionId, data });
      } else {
        await sendOrThrow({ type: "ai-session:input", sessionId: entry.sessionId, data });
      }
    } catch {
      /* session may have just exited — ignore */
    }
  }

  private async sendResize(entry: HubEntry, cols: number, rows: number): Promise<void> {
    try {
      if (entry.mode === "shell") {
        await sendOrThrow({ type: "terminal:resize", sessionId: entry.sessionId, cols, rows });
      } else {
        await sendOrThrow({ type: "ai-session:resize", sessionId: entry.sessionId, cols, rows });
      }
    } catch {
      /* noop */
    }
  }

  private async sendAck(entry: HubEntry, seq: number): Promise<void> {
    try {
      if (entry.mode === "shell") {
        await sendOrThrow({ type: "terminal:ack", sessionId: entry.sessionId, seq });
      } else {
        await sendOrThrow({ type: "ai-session:ack", sessionId: entry.sessionId, seq });
      }
    } catch {
      /* noop */
    }
  }
}

/** Singleton — terminal state is inherently global to the renderer. */
export const TerminalHub = new TerminalHubImpl();

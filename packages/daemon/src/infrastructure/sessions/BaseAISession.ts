import { EventEmitter } from "node:events";
import { spawn as ptySpawn } from "node-pty";
import type { IPty } from "node-pty";
import type { AIProvider, AISessionStatus } from "@magenta/shared/aiTerminal";

export interface AISessionEvents {
  data: (data: string) => void;
  status: (status: AISessionStatus) => void;
  exit: (exitCode: number) => void;
}

export abstract class BaseAISession extends EventEmitter {
  readonly id: string;
  readonly provider: AIProvider;
  private pty: IPty | null = null;
  private currentStatus: AISessionStatus = "idle";

  constructor(id: string, provider: AIProvider) {
    super();
    this.id = id;
    this.provider = provider;
  }

  protected abstract getBinaryName(): string;
  protected abstract detectStatus(
    data: string,
    currentStatus: AISessionStatus
  ): AISessionStatus | null;

  start(cwd: string, args: string[], cols: number, rows: number): void {
    const binaryName = this.getBinaryName();

    this.pty = ptySpawn(binaryName, args, {
      name: "xterm-256color",
      cwd,
      cols,
      rows,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      } as Record<string, string>,
    });

    this.setStatus("active");

    this.pty.onData((data: string) => {
      this.emit("data", data);

      // Attempt status detection
      const newStatus = this.detectStatus(data, this.currentStatus);
      if (newStatus !== null && newStatus !== this.currentStatus) {
        this.setStatus(newStatus);
      }
    });

    this.pty.onExit(({ exitCode }) => {
      this.pty = null;
      this.setStatus("exited");
      this.emit("exit", exitCode ?? 0);
    });
  }

  sendInput(text: string): void {
    if (!this.pty) return;
    this.pty.write(text);
  }

  resize(cols: number, rows: number): void {
    if (!this.pty) return;
    this.pty.resize(cols, rows);
  }

  stop(): void {
    if (!this.pty) return;
    this.pty.kill();
    this.pty = null;
  }

  getStatus(): AISessionStatus {
    return this.currentStatus;
  }

  private setStatus(status: AISessionStatus): void {
    this.currentStatus = status;
    this.emit("status", status);
  }
}

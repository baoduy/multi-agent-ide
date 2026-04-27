import path from "node:path";
import type { CommitSummary, CommitFile } from "@magenta/shared/ipc";
import { createGit } from "../../../core/utils/createGit";
import type { GitBatchGateway } from "./GitBatchGateway";
import type { LruCache } from "../../../core/utils/LruCache";

export type LogArgs = {
  branch?: string;
  path?: string;
  limit: number;
  skip: number;
  search?: string;
};

export type LogResult = { commits: CommitSummary[]; hasMore: boolean };
export type CommitDetailResult = { commit: CommitSummary; files: CommitFile[] };

/** Unique delimiters chosen to not appear in commit messages. */
const FIELD_SEP = "\x1e"; // record separator
const COMMIT_SEP = "\x1f\x1fEND\x1f\x1f";
const LOG_FORMAT = ["%H", "%h", "%an", "%ae", "%ct", "%P", "%D", "%s", "%b"].join(FIELD_SEP);

function parseLogOutput(raw: string): CommitSummary[] {
  const chunks = raw.split(COMMIT_SEP);
  const commits: CommitSummary[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(FIELD_SEP);
    if (parts.length < 9) continue;
    const [sha, shortSha, authorName, authorEmail, ts, parents, refs, subject, body] = parts;
    commits.push({
      sha: sha!,
      shortSha: shortSha!,
      authorName: authorName!,
      authorEmail: authorEmail!,
      timestamp: parseInt(ts!, 10) || 0,
      subject: subject!,
      body: body!,
      parents: parents!.trim() ? parents!.trim().split(/\s+/) : [],
      refs: refs!.trim() ? refs!.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
  }
  return commits;
}

function isLikelyBinary(buffer: string): boolean {
  if (!buffer) return false;
  const sample = buffer.slice(0, 8192);
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true;
    // Count non-printable control chars (excluding tab/newline/CR)
    if (code < 9 || (code > 13 && code < 32)) control++;
  }
  return control / sample.length > 0.05;
}

function logCacheKey(repoPath: string, args: LogArgs): string {
  return [
    "log",
    path.resolve(repoPath),
    args.branch ?? "",
    args.path ?? "",
    args.search ?? "",
    args.skip,
    args.limit,
  ].join("|");
}

function commitDetailCacheKey(repoPath: string, sha: string): string {
  return `cd|${path.resolve(repoPath)}|${sha}`;
}

export interface GitHistoryCaches {
  logCache?: LruCache<string, LogResult>;
  commitDetailCache?: LruCache<string, CommitDetailResult>;
}

export class GitHistoryGateway {
  constructor(
    private readonly batchGateway?: GitBatchGateway,
    private readonly caches: GitHistoryCaches = {},
  ) {}

  async log(repoPath: string, args: LogArgs): Promise<LogResult> {
    const cacheKey = logCacheKey(repoPath, args);
    const cached = this.caches.logCache?.get(cacheKey);
    if (cached) return cached;

    const git = createGit(path.resolve(repoPath));
    // Fetch one extra row to detect hasMore in a single process call — drops
    // the old "probe" query entirely.
    const fetchCount = args.limit + 1;
    const logArgs: string[] = [
      `--pretty=format:${LOG_FORMAT}${COMMIT_SEP}`,
      `--skip=${args.skip}`,
      `-n`, String(fetchCount),
    ];
    if (args.search) logArgs.push(`--grep=${args.search}`, "-i");
    if (args.branch) logArgs.push(args.branch);
    if (args.path) logArgs.push("--", args.path);

    const raw = await git.raw(["log", ...logArgs]);
    const commits = parseLogOutput(raw);

    let hasMore = false;
    if (commits.length > args.limit) {
      hasMore = true;
      commits.length = args.limit;
    }

    const result: LogResult = { commits, hasMore };
    this.caches.logCache?.set(cacheKey, result);
    return result;
  }

  /**
   * Collapse three `git show` processes into one by asking for the commit
   * summary, numstat, and raw name-status all in a single invocation.
   *
   * Output shape (top to bottom):
   *   <LOG_FORMAT>\n
   *   <COMMIT_SEP>\n
   *   12\t3\tpath         ← numstat rows ("-\t-\tpath" for binary)
   *   ...
   *   (blank separator line)
   *   :100644 100644 a b M\tpath                     ← raw rows (name-status encoded)
   *   :100644 000000 a 0 D\tpath
   *   :100644 100644 a b R100\told\tnew
   */
  async commitDetail(repoPath: string, sha: string): Promise<CommitDetailResult> {
    const cacheKey = commitDetailCacheKey(repoPath, sha);
    const cached = this.caches.commitDetailCache?.get(cacheKey);
    if (cached) return cached;

    const git = createGit(path.resolve(repoPath));

    // Single git process: summary, numstat (additions/deletions), and raw
    // (includes old+new paths for renames, file statuses, and modes).
    // Git emits raw rows before numstat rows — our parser accepts either
    // order by classifying lines rather than relying on blocks.
    const combined = await git.raw([
      "show",
      `--pretty=format:${LOG_FORMAT}${COMMIT_SEP}`,
      "--numstat",
      "--raw",
      sha,
    ]);

    // Split at the commit separator — anything before is the summary, anything after is file rows.
    const sepIdx = combined.indexOf(COMMIT_SEP);
    if (sepIdx < 0) {
      // Fallback to the multi-call path if the combined format fails.
      return this.commitDetailFallback(repoPath, sha);
    }

    const summaryRaw = combined.slice(0, sepIdx);
    const body = combined.slice(sepIdx + COMMIT_SEP.length);
    const [maybeCommit] = parseLogOutput(summaryRaw + COMMIT_SEP);
    if (!maybeCommit) {
      throw new Error(`Commit not found: ${sha}`);
    }
    const commit = maybeCommit;

    const files = parseCombinedFiles(body);
    const result: CommitDetailResult = { commit, files };
    this.caches.commitDetailCache?.set(cacheKey, result);
    return result;
  }

  /** Legacy three-process path — used only if the combined parser ever fails. */
  private async commitDetailFallback(repoPath: string, sha: string): Promise<CommitDetailResult> {
    const git = createGit(path.resolve(repoPath));
    const [summaryRaw, numstatRaw, namestatusRaw] = await Promise.all([
      git.raw(["show", "-s", `--pretty=format:${LOG_FORMAT}`, sha]),
      git.raw(["show", "--numstat", "--format=", sha]),
      git.raw(["show", "--name-status", "--format=", sha]),
    ]);

    const [maybeCommit] = parseLogOutput(summaryRaw + COMMIT_SEP);
    if (!maybeCommit) throw new Error(`Commit not found: ${sha}`);
    const commit = maybeCommit;

    const adds = new Map<string, { additions: number; deletions: number }>();
    for (const line of numstatRaw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(/^(\S+)\t(\S+)\t(.+)$/);
      if (!m) continue;
      const [, aStr, dStr, p] = m;
      const additions = aStr === "-" ? 0 : parseInt(aStr!, 10) || 0;
      const deletions = dStr === "-" ? 0 : parseInt(dStr!, 10) || 0;
      adds.set(p!, { additions, deletions });
    }

    const files: CommitFile[] = [];
    for (const line of namestatusRaw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const code = parts[0]!;
      const letter = code[0];
      const status: CommitFile["status"] =
        letter === "A" ? "added" :
        letter === "D" ? "deleted" :
        letter === "R" ? "renamed" :
        letter === "C" ? "copied" :
        "modified";
      if ((letter === "R" || letter === "C") && parts.length >= 3) {
        const oldPath = parts[1]!;
        const newPath = parts[2]!;
        const counts = adds.get(newPath) ?? adds.get(oldPath) ?? { additions: 0, deletions: 0 };
        files.push({ path: newPath, oldPath, status, ...counts });
      } else {
        const p = parts[1] ?? "";
        const counts = adds.get(p) ?? { additions: 0, deletions: 0 };
        files.push({ path: p, status, ...counts });
      }
    }
    return { commit, files };
  }

  async diff(
    repoPath: string,
    args: { fromRef?: string; toRef?: string; path: string },
  ): Promise<{
    oldContent: string | null;
    newContent: string | null;
    oldPath: string | null;
    newPath: string | null;
    isBinary: boolean;
  }> {
    const readAtBatch = async (ref: string | undefined, p: string): Promise<string | null> => {
      if (!ref) return null;
      if (!this.batchGateway) return readAtSpawn(ref, p);
      const blob = await this.batchGateway.getBlob(path.resolve(repoPath), ref, p);
      if (!blob) return null;
      // `git cat-file` returns raw bytes; callers expect a string. We keep the
      // isBinary heuristic-based render upstream, so decoding as utf-8 for
      // binary data is fine (the diff panel will fall back to "binary file").
      return blob.content.toString("utf8");
    };

    const readAtSpawn = async (ref: string | undefined, p: string): Promise<string | null> => {
      if (!ref) return null;
      try {
        const git = createGit(path.resolve(repoPath));
        return await git.raw(["show", `${ref}:${p}`]);
      } catch {
        return null;
      }
    };

    const fromRef = args.fromRef;
    const toRef = args.toRef ?? "HEAD";
    const [oldContent, newContent] = await Promise.all([
      readAtBatch(fromRef, args.path),
      readAtBatch(toRef, args.path),
    ]);

    const isBinary = isLikelyBinary(oldContent ?? "") || isLikelyBinary(newContent ?? "");
    return {
      oldContent,
      newContent,
      oldPath: oldContent != null ? args.path : null,
      newPath: newContent != null ? args.path : null,
      isBinary,
    };
  }
}

/**
 * Parse the combined numstat+raw output that follows the commit summary.
 *
 * `--numstat` rows look like:  "12\t3\tpath"                    (or "-\t-\tpath" for binary)
 *                              "12\t3\told\tnew"                (rename, 4 tab-separated fields)
 * `--raw` rows look like:      ":mode mode sha sha M\tpath"
 *                              ":mode mode sha sha R100\told\tnew"
 *
 * Git emits raw rows first by default, but we classify by line shape so the
 * order doesn't matter. Raw rows give us the status + old/new paths for
 * renames; numstat rows give us the +/- counts.
 */
const NUMSTAT_RE = /^(\d+|-)\t(\d+|-)\t/;

function parseCombinedFiles(body: string): CommitFile[] {
  const counts = new Map<string, { additions: number; deletions: number }>();
  const rawEntries: Array<{ status: CommitFile["status"]; path: string; oldPath?: string }> = [];

  for (const rawLine of body.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    // --raw row
    if (rawLine.startsWith(":")) {
      const tabIdx = rawLine.indexOf("\t");
      if (tabIdx < 0) continue;
      const header = rawLine.slice(0, tabIdx);
      const rest = rawLine.slice(tabIdx + 1);
      const headerParts = header.split(" ");
      const code = headerParts[headerParts.length - 1]!;
      const letter = code[0];
      const status: CommitFile["status"] =
        letter === "A" ? "added" :
        letter === "D" ? "deleted" :
        letter === "R" ? "renamed" :
        letter === "C" ? "copied" :
        "modified";

      if (letter === "R" || letter === "C") {
        const pathParts = rest.split("\t");
        const oldPath = pathParts[0] ?? "";
        const newPath = pathParts[1] ?? pathParts[0] ?? "";
        rawEntries.push({ status, path: newPath, oldPath });
      } else {
        const p = rest.split("\t")[0] ?? "";
        rawEntries.push({ status, path: p });
      }
      continue;
    }

    // --numstat row
    if (NUMSTAT_RE.test(rawLine)) {
      const parts = rawLine.split("\t");
      const aStr = parts[0]!;
      const dStr = parts[1]!;
      const additions = aStr === "-" ? 0 : parseInt(aStr, 10) || 0;
      const deletions = dStr === "-" ? 0 : parseInt(dStr, 10) || 0;
      // For renames, numstat emits 4 fields: add\tdel\told\tnew — we key on
      // the new path since that's what we'll display.
      const pathKey = parts.length >= 4 ? parts[parts.length - 1]! : parts[2] ?? "";
      if (pathKey) counts.set(pathKey, { additions, deletions });
    }
  }

  return rawEntries.map((e) => {
    const c = counts.get(e.path) ?? (e.oldPath ? counts.get(e.oldPath) : undefined) ?? { additions: 0, deletions: 0 };
    return e.oldPath ? { path: e.path, oldPath: e.oldPath, status: e.status, ...c } : { path: e.path, status: e.status, ...c };
  });
}

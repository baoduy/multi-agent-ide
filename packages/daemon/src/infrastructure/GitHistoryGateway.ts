import path from "node:path";
import type { CommitSummary, CommitFile } from "@magenta/shared/ipc";
import { createGit } from "./utils/createGit";

export type LogArgs = {
  branch?: string;
  path?: string;
  limit: number;
  skip: number;
  search?: string;
};

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

export class GitHistoryGateway {
  async log(repoPath: string, args: LogArgs): Promise<{ commits: CommitSummary[]; hasMore: boolean }> {
    const git = createGit(path.resolve(repoPath));
    const logArgs: string[] = [
      `--pretty=format:${LOG_FORMAT}${COMMIT_SEP}`,
      `--skip=${args.skip}`,
      `-n`, String(args.limit),
    ];
    if (args.search) logArgs.push(`--grep=${args.search}`, "-i");
    if (args.branch) logArgs.push(args.branch);
    if (args.path) logArgs.push("--", args.path);

    const raw = await git.raw(["log", ...logArgs]);
    const commits = parseLogOutput(raw);

    // Cheap probe: did we return a full page? If so, there's at least one more.
    let hasMore = false;
    if (commits.length === args.limit) {
      const probeArgs: string[] = [
        `--pretty=format:x`,
        `--skip=${args.skip + args.limit}`,
        `-n`, `1`,
      ];
      if (args.search) probeArgs.push(`--grep=${args.search}`, "-i");
      if (args.branch) probeArgs.push(args.branch);
      if (args.path) probeArgs.push("--", args.path);
      const probe = await git.raw(["log", ...probeArgs]);
      hasMore = probe.trim().length > 0;
    }

    return { commits, hasMore };
  }

  async commitDetail(repoPath: string, sha: string): Promise<{ commit: CommitSummary; files: CommitFile[] }> {
    const git = createGit(path.resolve(repoPath));

    // Summary
    const [summaryRaw, numstatRaw, namestatusRaw] = await Promise.all([
      git.raw(["show", "-s", `--pretty=format:${LOG_FORMAT}`, sha]),
      git.raw(["show", "--numstat", "--format=", sha]),
      git.raw(["show", "--name-status", "--format=", sha]),
    ]);

    const [maybeCommit] = parseLogOutput(summaryRaw + COMMIT_SEP);
    if (!maybeCommit) throw new Error(`Commit not found: ${sha}`);
    const commit = maybeCommit;

    // numstat: "12\t3\tpath" (or "-\t-\tpath" for binary)
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

    // name-status: "M<tab>path" or "R100<tab>old<tab>new"
    const files: CommitFile[] = [];
    for (const line of namestatusRaw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split("\t");
      const code = parts[0]!;
      const letter = code[0];
      let status: CommitFile["status"];
      switch (letter) {
        case "A": status = "added"; break;
        case "M": status = "modified"; break;
        case "D": status = "deleted"; break;
        case "R": status = "renamed"; break;
        case "C": status = "copied"; break;
        default: status = "modified"; break;
      }
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
    const git = createGit(path.resolve(repoPath));

    const readAt = async (ref: string | undefined, p: string): Promise<string | null> => {
      if (!ref) return null;
      try {
        return await git.raw(["show", `${ref}:${p}`]);
      } catch {
        // File doesn't exist at that ref (added/deleted cases)
        return null;
      }
    };

    const fromRef = args.fromRef;
    const toRef = args.toRef ?? "HEAD";
    const [oldContent, newContent] = await Promise.all([
      readAt(fromRef, args.path),
      readAt(toRef, args.path),
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

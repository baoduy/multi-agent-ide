import path from "node:path";
import type { BlameLine } from "@magenta/shared/ipc";
import { createGit } from "./utils/createGit";

/**
 * Parses `git blame --porcelain` output into one BlameLine per source line.
 *
 * Porcelain format: each line begins with either
 *   `<sha> <orig-line> <final-line> [<group>]`  (header line for a blame group)
 *   `author …`, `author-time …`, etc. (metadata lines)
 *   `\t<line content>`                          (the actual source line)
 *
 * The full author metadata only appears the first time a given sha is seen;
 * subsequent groups for the same sha just have the short header + content.
 */
export class GitBlameGateway {
  async blame(repoPath: string, filePath: string, ref?: string): Promise<BlameLine[]> {
    const git = createGit(path.resolve(repoPath));
    const args = ["blame", "--porcelain"];
    if (ref) args.push(ref);
    args.push("--", filePath);
    const raw = await git.raw(args);

    const lines = raw.split(/\r?\n/);
    const shaMeta = new Map<string, { author: string; timestamp: number }>();
    const out: BlameLine[] = [];

    let i = 0;
    while (i < lines.length) {
      const header = lines[i]!;
      if (!header) { i++; continue; }
      const headerMatch = header.match(/^([a-f0-9]{40}) \d+ (\d+)/);
      if (!headerMatch) { i++; continue; }
      const sha = headerMatch[1]!;
      const finalLine = parseInt(headerMatch[2]!, 10);

      let author = shaMeta.get(sha)?.author ?? "";
      let timestamp = shaMeta.get(sha)?.timestamp ?? 0;

      i++;
      // Consume metadata until we hit the "\t<content>" line
      while (i < lines.length && !lines[i]!.startsWith("\t")) {
        const metaLine = lines[i]!;
        if (metaLine.startsWith("author ")) author = metaLine.slice(7);
        else if (metaLine.startsWith("author-time ")) {
          timestamp = parseInt(metaLine.slice(12), 10) || 0;
        }
        i++;
      }

      if (author || timestamp) {
        shaMeta.set(sha, { author, timestamp });
      } else {
        const cached = shaMeta.get(sha);
        if (cached) { author = cached.author; timestamp = cached.timestamp; }
      }

      const contentLine = lines[i] ?? "";
      const content = contentLine.startsWith("\t") ? contentLine.slice(1) : contentLine;
      i++;

      out.push({
        lineNo: finalLine,
        sha,
        shortSha: sha.slice(0, 7),
        author,
        timestamp,
        content,
      });
    }

    return out;
  }
}

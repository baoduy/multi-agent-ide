export interface ReleaseInfo {
  tagName: string;
  htmlUrl: string;
}

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Thin wrapper around the GitHub Releases API. Returns `null` on any
 * failure — the startup check should never propagate errors that could
 * crash the daemon. Transient network issues are logged at warn level.
 */
export class GitHubReleasesGateway {
  async getLatestRelease(repo: string): Promise<ReleaseInfo | null> {
    const url = `${GITHUB_API_BASE}/repos/${repo}/releases/latest`;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "magenta-ide",
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(`[github-releases] ${repo} returned HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
      if (typeof data.tag_name !== "string" || typeof data.html_url !== "string") {
        console.warn(`[github-releases] ${repo} returned malformed payload`);
        return null;
      }

      return { tagName: data.tag_name, htmlUrl: data.html_url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[github-releases] ${repo} fetch failed: ${message}`);
      return null;
    }
  }
}

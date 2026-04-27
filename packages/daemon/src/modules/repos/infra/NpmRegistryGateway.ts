export interface NpmPackageInfo {
  version: string;
  htmlUrl: string;
}

const REGISTRY_BASE = "https://registry.npmjs.org";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Queries the public npm registry for the latest published version of a
 * package. Returns `null` on any failure — callers treat that as "unable
 * to determine latest version" and skip the compare.
 */
export class NpmRegistryGateway {
  async getLatestVersion(packageName: string): Promise<NpmPackageInfo | null> {
    const url = `${REGISTRY_BASE}/${encodeURI(packageName)}/latest`;
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "magenta-ide",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        console.warn(`[npm-registry] ${packageName} returned HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as { version?: unknown };
      if (typeof data.version !== "string") {
        console.warn(`[npm-registry] ${packageName} returned malformed payload`);
        return null;
      }

      return {
        version: data.version,
        htmlUrl: `https://www.npmjs.com/package/${packageName}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[npm-registry] ${packageName} fetch failed: ${message}`);
      return null;
    }
  }
}

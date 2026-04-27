import { CACHE_SCHEMA_VERSION } from "./CACHE_SCHEMA_VERSION";
import type { LmdbStore } from "./LmdbStore";

/**
 * Sub-db names that contain cache data. Keep in sync with the repositories.
 * `_meta` is NOT included — the cache manager is the only writer for meta,
 * and wiping it would wipe the version marker we're about to write.
 */
export const CACHE_SUB_DB_NAMES = [
  "repos",
  "working_dirs",
  "session_state",
  "specs",
  "spec_stages",
  "synced_sessions",
  "worktrees",
] as const;

interface CacheVersionRecord {
  version: number;
  appliedAt: string;
}

/**
 * Reads `_meta.version`. If it's missing or below the current
 * `CACHE_SCHEMA_VERSION`, wipes every cache sub-db and stamps the new
 * version. Background sync jobs will rehydrate on first use.
 */
export async function runCacheSchemaCheck(store: LmdbStore): Promise<{
  wiped: boolean;
  previousVersion: number | null;
  currentVersion: number;
}> {
  const meta = store.openDb<CacheVersionRecord>("_meta");
  const record = meta.get("version");
  const previousVersion = record?.version ?? null;

  if (previousVersion !== null && previousVersion >= CACHE_SCHEMA_VERSION) {
    return { wiped: false, previousVersion, currentVersion: CACHE_SCHEMA_VERSION };
  }

  console.log(
    `[CacheSchemaManager] Cache schema version ${previousVersion ?? "absent"} < ${CACHE_SCHEMA_VERSION}; wiping cache sub-dbs.`,
  );

  await store.dropAll(CACHE_SUB_DB_NAMES);

  await meta.put("version", {
    version: CACHE_SCHEMA_VERSION,
    appliedAt: new Date().toISOString(),
  });

  return { wiped: true, previousVersion, currentVersion: CACHE_SCHEMA_VERSION };
}

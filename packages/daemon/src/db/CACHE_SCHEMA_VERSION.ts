/**
 * Cache schema version for the LMDB persistence layer.
 *
 * The daemon DB is a cache — authoritative state lives in git, the filesystem,
 * and AI provider session files. When this version number is bumped, the
 * CacheSchemaManager wipes all sub-dbs on next open and lets background sync
 * jobs rehydrate. This replaces the hand-written SQL migration chain.
 *
 * Bump this whenever the shape of any msgpack-encoded value changes
 * incompatibly (field renamed, removed, or type-changed).
 */
export const CACHE_SCHEMA_VERSION = 1;

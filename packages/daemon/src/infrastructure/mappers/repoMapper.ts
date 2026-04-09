import type { Repository } from "@magenta/shared/models";

/**
 * Maps a raw SQLite row to a Repository model.
 * Handles boolean conversion (SQLite stores 0/1).
 */
export function mapRepoRow(row: Record<string, unknown>): Repository {
  return {
    ...row,
    hasSpecs: Boolean(row.hasSpecs),
  } as Repository;
}

/**
 * Maps Repository model fields to SQLite column values.
 * Converts booleans to 0/1 for SQLite.
 */
export function toRepoRow(repo: Partial<Repository>): Record<string, unknown> {
  const row: Record<string, unknown> = { ...repo };
  if (repo.hasSpecs !== undefined) {
    row.hasSpecs = repo.hasSpecs ? 1 : 0;
  }
  return row;
}

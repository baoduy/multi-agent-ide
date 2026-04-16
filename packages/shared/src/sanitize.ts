/**
 * Shared sanitization and validation utilities for git branch names,
 * worktree names, and other identifiers that must be filesystem- and
 * git-safe.
 *
 * Used by both the daemon (application layer) and the renderer (UI validation).
 */

/**
 * Sanitize a string for use as a git branch or worktree directory name.
 *
 * - Replaces whitespace and any character not in `[a-zA-Z0-9._/-]` with a hyphen.
 * - Collapses consecutive hyphens into one.
 * - Strips leading/trailing hyphens and dots (git rejects these).
 * - Removes `..` sequences (git rejects `..` in ref names).
 */
export function sanitizeGitName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._/-]/g, "-")
    .replace(/\.{2,}/g, ".")       // collapse ".." → "."
    .replace(/-{2,}/g, "-")        // collapse "--" → "-"
    .replace(/^[.\-]+/, "")        // strip leading dots/hyphens
    .replace(/[.\-]+$/, "");       // strip trailing dots/hyphens
}

/**
 * Sanitize a string for use as a worktree directory name (stricter than branch).
 *
 * Only allows `[a-zA-Z0-9_-]`. Dots and slashes are NOT allowed because
 * worktree names map directly to a single directory name.
 */
export function sanitizeWorktreeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

/** Returns true if the string is already a valid git branch name (simplified check). */
export function isValidBranchName(name: string): boolean {
  if (!name) return false;
  if (name.includes("..")) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*[a-zA-Z0-9]$/.test(name);
}

/** Returns true if the string is already a valid worktree directory name. */
export function isValidWorktreeName(name: string): boolean {
  if (!name) return false;
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Sanitizes a string for use in branch names, directory names, etc.
 * Replaces any character that is not alphanumeric, underscore, or hyphen with a hyphen.
 * Collapses consecutive hyphens into one.
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-{2,}/g, "-");
}

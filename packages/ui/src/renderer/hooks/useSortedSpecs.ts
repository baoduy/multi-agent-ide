import { useMemo } from "react";
import type { SpecFolder } from "@magenta/shared/models";

/**
 * Returns a memoised copy of `specs` sorted by `createdAt` descending
 * (newest first).  Shared by the sidebar SpecTree and the center
 * SpecsListView so sorting logic lives in exactly one place.
 */
export function useSortedSpecs(specs: SpecFolder[]): SpecFolder[] {
  return useMemo(
    () => [...specs].sort((a, b) => b.createdAt - a.createdAt),
    [specs],
  );
}

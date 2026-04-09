import React, { useEffect } from "react";

import type { SpecFolder } from "@magenta/shared/models";
import { useSpecStore } from "../../store/specStore";
import { SpecItem } from "./SpecItem";

type SpecTreeProps = {
  specs: SpecFolder[];
  isLoading: boolean;
  selectedSpecPath: string | null;
  onSelectSpec: (specPath: string) => void;
};

/**
 * Renders a tree view of all spec folders for a repository.
 * Shows "No specs found" if the repo has no specs folder.
 */
export function SpecTree({
  specs,
  isLoading,
  selectedSpecPath,
  onSelectSpec,
}: SpecTreeProps): React.ReactElement {
  const containerStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    paddingBottom: 12,
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottom: "1px solid #e5e7eb",
  };

  const emptyStateStyle: React.CSSProperties = {
    padding: "12px",
    fontSize: 13,
    color: "#9ca3af",
    fontStyle: "italic",
  };

  const loadingStyle: React.CSSProperties = {
    padding: "12px",
    fontSize: 13,
    color: "#9ca3af",
  };

  if (isLoading) {
    return <div style={loadingStyle}>Loading specs...</div>;
  }

  if (specs.length === 0) {
    return <div style={emptyStateStyle}>No specs found</div>;
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Specs</div>
      {specs.map((spec) => (
        <SpecItem
          key={spec.id}
          spec={spec}
          isSelected={spec.path === selectedSpecPath}
          onSelect={onSelectSpec}
        />
      ))}
    </div>
  );
}

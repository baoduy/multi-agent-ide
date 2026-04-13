import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, FolderOpen, X } from "lucide-react";

import type { Repository } from "@magenta/shared/models";
import { RepoLabel, BranchLabel } from "./RepoLabel";
import { colors } from "../../utils/colors";
import { getRepoBadge } from "../../utils/repoBadge";

type SearchableRepoSelectorProps = {
  repos: Repository[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
};

export function SearchableRepoSelector({
  repos,
  selectedPath,
  onSelect,
}: SearchableRepoSelectorProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filteredRepos = useMemo(() => {
    if (!search.trim()) return repos;
    const q = search.toLowerCase();
    return repos.filter(
      (r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q),
    );
  }, [repos, search]);

  const selectedRepo = useMemo(
    () => repos.find((r) => r.path === selectedPath),
    [repos, selectedPath],
  );

  const handleSelect = useCallback(
    (path: string | null) => {
      onSelect(path);
      setIsOpen(false);
      setSearch("");
    },
    [onSelect],
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${isOpen ? colors.primary : colors.border}`,
          background: colors.bgSurface,
          cursor: "pointer",
          fontSize: 13,
          color: colors.text,
          transition: "border-color 0.15s",
          textAlign: "left",
        }}
      >
        {selectedRepo ? (
          <RepoLabel name={selectedRepo.name} size="sm" style={{ flex: 1, minWidth: 0 }} />
        ) : (
          <>
            <FolderOpen size={14} color={colors.textTertiary} style={{ flexShrink: 0 }} />
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Workspace (no repo)
            </span>
          </>
        )}
        <ChevronDown
          size={14}
          color={colors.textTertiary}
          style={{
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#ffffff",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            maxHeight: 300,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Search input */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderBottom: `1px solid ${colors.borderLight}`,
            }}
          >
            <Search size={13} color={colors.textTertiary} style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repositories..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 12,
                color: colors.text,
                background: "transparent",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <X size={12} color={colors.textTertiary} />
              </button>
            )}
          </div>

          {/* Options list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* Workspace option -- always first */}
            {(!search.trim() || "workspace".includes(search.toLowerCase())) && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  border: "none",
                  borderBottom: `1px solid ${colors.borderLight}`,
                  background: selectedPath === null ? colors.bgHover : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                  color: colors.text,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.bgHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    selectedPath === null ? colors.bgHover : "transparent";
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: 5,
                    background: "#88888814",
                    flexShrink: 0,
                  }}
                >
                  <FolderOpen size={14} color={colors.textTertiary} strokeWidth={1.8} />
                </span>
                <span style={{ fontWeight: 600, fontSize: 12 }}>Workspace</span>
                <span style={{ fontSize: 11, color: colors.textTertiary, marginLeft: "auto" }}>
                  No repo context
                </span>
              </button>
            )}

            {/* Repo options */}
            {filteredRepos.map((repo) => {
              const isSelected = selectedPath === repo.path;
              const badge = getRepoBadge(repo);
              return (
                <button
                  key={repo.path}
                  type="button"
                  onClick={() => handleSelect(repo.path)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 12px",
                    border: "none",
                    borderBottom: `1px solid ${colors.borderLight}`,
                    background: isSelected ? colors.bgHover : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.bgHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected ? colors.bgHover : "transparent";
                  }}
                >
                  <RepoLabel name={repo.name} size="md" boxed style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontSize: 9,
                        fontWeight: 500,
                        background: badge.bg,
                        color: badge.color,
                        lineHeight: "16px",
                      }}
                    >
                      {badge.label}
                    </span>
                    <BranchLabel name={repo.branch} size="xs" />
                  </RepoLabel>
                </button>
              );
            })}

            {filteredRepos.length === 0 && search.trim() && (
              <div style={{ padding: "12px", fontSize: 12, color: colors.textTertiary, textAlign: "center" }}>
                No matching repositories
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

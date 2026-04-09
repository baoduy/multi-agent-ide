import React from "react";

import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useSessionStore } from "../store/sessionStore";
import { useRepoStore } from "../store/repoStore";

/**
 * Welcome page shown on first launch or when there's no config.
 * Guides user to add a working directory.
 */
export function WelcomePage(): React.ReactElement {
  const sessionInitialized = useSessionStore((state) => state.initialized);
  const repos = useRepoStore((state) => state.repos);

  if (!sessionInitialized) {
    return <LoadingSpinner message="Initializing Magenta IDE..." />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        padding: 20,
      }}
    >
      <div style={{ maxWidth: 500, textAlign: "center" }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12, color: "#1f2937" }}>
          Welcome to Magenta IDE
        </h1>

        {repos.length === 0 ? (
          <>
            <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
              Get started by adding a working directory to scan for git repositories.
            </p>

            <div
              style={{
                backgroundColor: "#dbeafe",
                border: "1px solid #93c5fd",
                borderRadius: 8,
                padding: 16,
                marginBottom: 24,
              }}
            >
              <p style={{ fontSize: 14, color: "#1e40af", margin: 0 }}>
                💡 Tip: A working directory can contain multiple git repositories. Magenta IDE will
                scan up to 3 levels deep.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const path = window.prompt("Enter the path to scan for repositories:");
                if (path) {
                  // This would trigger via the Sidebar component
                  window.dispatchEvent(new CustomEvent("addWorkingDirectory", { detail: { path } }));
                }
              }}
              style={{
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 600,
                backgroundColor: "#3b82f6",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Add Working Directory
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 16, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
              Found {repos.length} repositor{repos.length === 1 ? "y" : "ies"}! Select one from the sidebar to get
              started.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useState } from "react";

import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { MagentaLogo } from "../components/common/MagentaLogo";
import { useSessionStore } from "../store/sessionStore";
import { useRepoStore } from "../store/repoStore";
import { useConfigStore } from "../store/configStore";
import { selectFolder } from "../utils/ipc";
import { colors } from "../utils/colors";

/**
 * Welcome page shown on first launch or when there's no config.
 * Guides user to add a working directory.
 */
export function WelcomePage(): React.ReactElement {
  const sessionInitialized = useSessionStore((state) => state.initialized);
  const repos = useRepoStore((state) => state.repos);
  const addWorkingDir = useConfigStore((state) => state.addWorkingDir);
  const configError = useConfigStore((state) => state.error);
  const triggerScan = useRepoStore((state) => state.triggerScan);
  const fetchRepos = useRepoStore((state) => state.fetchRepos);
  const repoError = useRepoStore((state) => state.error);
  const [isAdding, setIsAdding] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!sessionInitialized) {
    return <LoadingSpinner message="Initializing Magenta IDE..." />;
  }

  const handleAddDirectory = async (): Promise<void> => {
    const dirPath = await selectFolder();
    if (!dirPath) {
      return;
    }

    setIsAdding(true);
    setLocalError(null);
    setStatus("Adding directory...");

    try {
      // Step 1: Add working directory to config
      console.log("[welcome] Adding working dir:", dirPath);
      await addWorkingDir(dirPath);

      // Check if addWorkingDir returned an error (stored in configStore)
      const currentConfigError = useConfigStore.getState().error;
      if (currentConfigError) {
        console.error("[welcome] addWorkingDir failed:", currentConfigError);
        setLocalError(`Failed to add directory: ${currentConfigError}`);
        setStatus(null);
        setIsAdding(false);
        return;
      }

      console.log("[welcome] Working dir added successfully, workingDirs:", useConfigStore.getState().workingDirs);
      setStatus("Scanning for repositories...");

      // Step 2: Trigger a scan
      console.log("[welcome] Triggering scan...");
      await triggerScan();

      // Check if triggerScan returned an error
      const currentRepoError = useRepoStore.getState().error;
      if (currentRepoError) {
        console.error("[welcome] triggerScan failed:", currentRepoError);
        setLocalError(`Failed to start scan: ${currentRepoError}`);
        setStatus(null);
        setIsAdding(false);
        return;
      }

      // Step 3: Wait for the scan to complete.
      setStatus("Waiting for scan results...");

      // Poll for repos — the scan should complete within a few seconds for most directories
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log(`[welcome] Polling for repos (attempt ${i + 1}/15)...`);
        await fetchRepos();

        // Check if repos appeared (read directly from store)
        const currentRepos = useRepoStore.getState().repos;
        console.log(`[welcome] Found ${currentRepos.length} repos`);
        if (currentRepos.length > 0) {
          console.log("[welcome] Repos found! Transition should happen automatically.");
          setStatus(null);
          setIsAdding(false);
          return;
        }

        // Also check if an error occurred during scan
        const scanError = useRepoStore.getState().error;
        if (scanError) {
          console.error("[welcome] Scan error:", scanError);
          setLocalError(`Scan error: ${scanError}`);
          setStatus(null);
          setIsAdding(false);
          return;
        }
      }

      // If we get here, no repos were found after all retries
      setStatus(null);
      setIsAdding(false);
      setLocalError(
        "No git repositories found in the selected directory after scanning. " +
        "Make sure it contains git repos (searched up to 3 levels deep)."
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[welcome] Error:", msg);
      setLocalError(msg);
      setStatus(null);
      setIsAdding(false);
    }
  };

  // Combine errors from different sources
  const displayError = localError || configError || repoError;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: colors.bgSurface,
        padding: 12,
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
          <MagentaLogo size={56} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: colors.textStrong }}>
          Welcome to Magenta IDE
        </h1>

        {repos.length === 0 ? (
          <>
            <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Get started by adding a working directory to scan for git repositories.
            </p>

            <div
              style={{
                backgroundColor: colors.bgPanel,
                border: `1px solid ${colors.border}`,
                borderRadius: 6,
                padding: 10,
                marginBottom: 12,
              }}
            >
              <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>
                Tip: A working directory can contain multiple git repositories. Magenta IDE will
                scan up to 3 levels deep.
              </p>
            </div>

            {displayError && (
              <div
                style={{
                  backgroundColor: colors.errorSoft,
                  border: `1px solid ${colors.errorSoftBorder}`,
                  borderRadius: 6,
                  padding: 8,
                  marginBottom: 10,
                  fontSize: 11,
                  color: colors.errorDark,
                  textAlign: "left",
                }}
              >
                {displayError}
              </div>
            )}

            {status && (
              <div
                style={{
                  fontSize: 11,
                  color: colors.textMuted,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    border: `2px solid ${colors.primary}`,
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                {status}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleAddDirectory()}
              disabled={isAdding}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: isAdding ? colors.primaryAlpha : colors.primary,
                color: colors.textWhite,
                border: "none",
                borderRadius: 4,
                cursor: isAdding ? "default" : "pointer",
                transition: "background 0.12s",
              }}
            >
              {isAdding ? "Scanning..." : "Add Working Directory"}
            </button>
          </>
        ) : (
          <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
            Found {repos.length} repositor{repos.length === 1 ? "y" : "ies"}! Select one from the sidebar to get
            started.
          </p>
        )}
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from "react";

import { ipc } from "../../utils/ipc";
import { ScrollableText } from "../common/ScrollableText";
import { useOnboardStore } from "../../store/onboardStore";
import type { OnboardProcess } from "../../store/onboardStore";

/* ── Types ── */

export type JobStatus = "running" | "completed" | "failed";

export type BackgroundJob = {
  name: string;
  status: JobStatus;
  startedAt: number;
  elapsed?: number;
  error?: string;
};

/* ── Hook: subscribe to job events ── */

export function useBackgroundJobs() {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      ipc.on("job:started", (payload) => {
        setJobs((prev) => {
          // Replace if same name already exists (re-run)
          const filtered = prev.filter((j) => j.name !== payload.name);
          return [
            { name: payload.name, status: "running", startedAt: Date.now() },
            ...filtered,
          ];
        });
      }),
    );

    unsubs.push(
      ipc.on("job:completed", (payload) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.name === payload.name
              ? { ...j, status: "completed" as const, elapsed: payload.elapsed }
              : j,
          ),
        );
      }),
    );

    unsubs.push(
      ipc.on("job:failed", (payload) => {
        setJobs((prev) =>
          prev.map((j) =>
            j.name === payload.name
              ? { ...j, status: "failed" as const, error: payload.error }
              : j,
          ),
        );
      }),
    );

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const clearCompleted = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "running"));
  }, []);

  // Also count onboard processes
  const onboardProcesses = useOnboardStore((s) => s.processes);
  const onboardRunning = Object.values(onboardProcesses).filter(
    (p) => p.phase === "running",
  ).length;
  const onboardFailed = Object.values(onboardProcesses).filter(
    (p) => p.phase === "done" && !p.success,
  ).length;

  const onboardDone = Object.values(onboardProcesses).filter(
    (p) => p.phase === "done",
  ).length;

  const runningCount = jobs.filter((j) => j.status === "running").length + onboardRunning;
  const completedCount = jobs.filter((j) => j.status === "completed").length + onboardDone - onboardFailed;
  const failedCount = jobs.filter((j) => j.status === "failed").length + onboardFailed;
  // Badge shows all uncleared notifications (running + completed + failed)
  const totalCount = runningCount + completedCount + failedCount;

  return { jobs, runningCount, failedCount, totalCount, clearCompleted };
}

/* ── Status dot colors ── */

const STATUS_COLORS: Record<JobStatus, string> = {
  running: "#C15F3C",
  completed: "#3d7a2a",
  failed: "#c44",
};

/* ── Bell icon with optional badge ── */

export function BellIcon({
  badgeCount,
  hasError,
}: {
  badgeCount: number;
  hasError: boolean;
}): React.ReactElement {
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 1.5C5.8 1.5 4 3.3 4 5.5V8L3 10H13L12 8V5.5C12 3.3 10.2 1.5 8 1.5Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M6.5 10.5V11C6.5 11.83 7.17 12.5 8 12.5C8.83 12.5 9.5 11.83 9.5 11V10.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {badgeCount > 0 && (
        <span
          style={{
            position: "absolute",
            top: -3,
            right: -4,
            background: hasError ? "#c44" : "#C15F3C",
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            borderRadius: 6,
            minWidth: 12,
            height: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 3px",
            lineHeight: 1,
          }}
        >
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      )}
    </div>
  );
}

/* ── Spinner for running jobs ── */

function Spinner(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      xmlns="http://www.w3.org/2000/svg"
      style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="6"
        cy="6"
        r="5"
        stroke="#C15F3C"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="20"
        strokeDashoffset="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Format elapsed time ── */

function formatElapsed(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ── Onboard process job row ── */

function OnboardJobRow({
  process,
  onViewOutput,
}: {
  process: OnboardProcess;
  onViewOutput: () => void;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const label =
    process.kind === "onboard"
      ? `Onboard: ${process.repoName}`
      : `Upgrade: ${process.repoName}`;

  const status: JobStatus =
    process.phase === "running"
      ? "running"
      : process.success
        ? "completed"
        : "failed";

  return (
    <div
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid #f0ede6",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {/* Status indicator */}
      {status === "running" ? (
        <Spinner />
      ) : (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: STATUS_COLORS[status],
            flexShrink: 0,
          }}
        />
      )}

      {/* Job info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <ScrollableText
          style={{
            fontSize: 12,
            color: "#2c2c2c",
          }}
        >
          {label}
        </ScrollableText>
        {process.phase === "done" && !process.success && process.error && (
          <ScrollableText
            style={{
              fontSize: 11,
              color: "#c44",
              marginTop: 2,
            }}
            title={process.error}
          >
            {process.error}
          </ScrollableText>
        )}
      </div>

      {/* View output button */}
      <button
        type="button"
        onClick={onViewOutput}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          fontSize: 11,
          color: hovered ? "#C15F3C" : "#9a958c",
          background: hovered ? "#f0ede6" : "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 8px",
          borderRadius: 4,
          flexShrink: 0,
          fontFamily: "inherit",
          transition: "color 0.12s, background 0.12s",
        }}
      >
        View
      </button>
    </div>
  );
}

/* ── Popover ── */

type BackgroundJobsPopoverProps = {
  jobs: BackgroundJob[];
  onClearCompleted: () => void;
  onClose: () => void;
};

export function BackgroundJobsPopover({
  jobs,
  onClearCompleted,
  onClose,
}: BackgroundJobsPopoverProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const onboardProcesses = useOnboardStore((s) => s.processes);
  const setDialogOpen = useOnboardStore((s) => s.setDialogOpen);
  const dismiss = useOnboardStore((s) => s.dismiss);

  const processList = Object.values(onboardProcesses);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const hasNonRunning = jobs.some((j) => j.status !== "running");
  const hasCompletedOnboard = processList.some((p) => p.phase === "done");

  const handleClearAll = useCallback(() => {
    onClearCompleted();
    // Also dismiss completed onboard processes
    for (const p of processList) {
      if (p.phase === "done") {
        dismiss(p.repoPath);
      }
    }
  }, [onClearCompleted, processList, dismiss]);

  const handleViewOutput = useCallback(
    (repoPath: string) => {
      setDialogOpen(repoPath, true);
      onClose();
    },
    [setDialogOpen, onClose],
  );

  const isEmpty = jobs.length === 0 && processList.length === 0;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        right: 0,
        width: 300,
        maxHeight: 360,
        background: "#fff",
        border: "1px solid #e5e2da",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        // Prevent dragging the title bar through the popover
        appRegion: "no-drag",
        WebkitAppRegion: "no-drag",
      } as React.CSSProperties}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #f0ede6",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "#2c2c2c" }}>
          Background Jobs
        </span>
        {(hasNonRunning || hasCompletedOnboard) && (
          <button
            type="button"
            onClick={handleClearAll}
            style={{
              fontSize: 11,
              color: "#9a958c",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 6px",
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#2c2c2c";
              e.currentTarget.style.background = "#f0ede6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#9a958c";
              e.currentTarget.style.background = "none";
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Job list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {isEmpty ? (
          <div
            style={{
              padding: "24px 14px",
              textAlign: "center",
              fontSize: 12,
              color: "#9a958c",
            }}
          >
            No background jobs
          </div>
        ) : (
          <>
            {/* Onboard/Upgrade processes */}
            {processList.map((proc) => (
              <OnboardJobRow
                key={proc.repoPath}
                process={proc}
                onViewOutput={() => handleViewOutput(proc.repoPath)}
              />
            ))}

            {/* Regular background jobs */}
            {jobs.map((job) => (
              <div
                key={job.name}
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid #f0ede6",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {/* Status indicator */}
                {job.status === "running" ? (
                  <Spinner />
                ) : (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: STATUS_COLORS[job.status],
                      flexShrink: 0,
                    }}
                  />
                )}

                {/* Job info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ScrollableText
                    style={{
                      fontSize: 12,
                      color: "#2c2c2c",
                    }}
                  >
                    {job.name}
                  </ScrollableText>
                  {job.error && (
                    <ScrollableText
                      style={{
                        fontSize: 11,
                        color: "#c44",
                        marginTop: 2,
                      }}
                      title={job.error}
                    >
                      {job.error}
                    </ScrollableText>
                  )}
                </div>

                {/* Elapsed time */}
                {job.elapsed != null && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "#9a958c",
                      flexShrink: 0,
                    }}
                  >
                    {formatElapsed(job.elapsed)}
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

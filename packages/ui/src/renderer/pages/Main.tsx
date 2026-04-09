import React from "react";

import { MainLayout } from "../components/layouts/MainLayout";
import { Sidebar } from "../components/sidebar/Sidebar";
import { FlowDiagram } from "../components/flow/FlowDiagram";
import { useSpecStore } from "../store/specStore";
import { useSessionRestoration } from "../hooks/useSessionRestoration";


import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useRepoStore } from "../store/repoStore";
import { useSessionStore } from "../store/sessionStore";
import { WelcomePage } from "./Welcome";

function PlaceholderCard({ title, body }: { title: string; body: string }): React.ReactElement {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        background: "#ffffff",
      }}
    >
      <h3 style={{ margin: 0, marginBottom: 8, fontSize: 14 }}>{title}</h3>
      <p style={{ margin: 0, color: "#4b5563", fontSize: 13 }}>{body}</p>
    </div>
  );
}

function ActivityPanel(): React.ReactElement {
  return <PlaceholderCard title="Activity" body="Agent status and quick actions will appear here." />;
}

export function MainPage(): React.ReactElement {
  // Initialize session on mount
  useSessionRestoration();

  // Get state from stores
  const sessionInitialized = useSessionStore((state) => state.initialized);
  const isLoading = useSessionStore((state) => state.isLoading);
  const repos = useRepoStore((state) => state.repos);
  const selectedSpecPath = useSpecStore((state) => state.selectedSpecPath);
  const specs = useSpecStore((state) => state.specs);

  // Show loading spinner during initialization
  if (!sessionInitialized || isLoading) {
    return <LoadingSpinner message="Loading your workspace..." />;
  }

  // Show welcome page if no repos
  if (repos.length === 0) {
    return <WelcomePage />;
  }

  // Find selected spec

  const selectedSpec = specs.find((s) => s.path === selectedSpecPath) || null;
  // Main layout with sidebar, flow diagram, and activity panel

  return (
    <MainLayout
      sidebar={<Sidebar />}
      main={
        selectedSpec ? (
          <FlowDiagram spec={selectedSpec} />
        ) : (
          <PlaceholderCard title="Spec Pipeline" body="Select a spec to view its pipeline." />
        )
      }
      activity={<ActivityPanel />}
    />
  );
}

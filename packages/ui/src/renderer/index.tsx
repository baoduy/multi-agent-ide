import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { MainPage } from "./pages/Main";
import { DockMainPage } from "./pages/DockMainPage";
import { ThemeProvider } from "./theme/ThemeProvider";

/**
 * Feature flag: dock layout is now the DEFAULT.
 * Use ?dockLayout=0 or localStorage to opt out to the legacy layout.
 */
function useDockLayout(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("dockLayout") === "0") return false;
  if (params.get("dockLayout") === "1") return true;
  const stored = localStorage.getItem("magenta:dock-layout-enabled");
  if (stored === "0") return false;
  return true; // Default ON
}

function AppRoot(): React.ReactElement {
  const dockEnabled = useDockLayout();
  return dockEnabled ? <DockMainPage /> : <MainPage />;
}

// Initialize app
function initializeApp(): void {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    console.error("Root element not found");
    return;
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ThemeProvider>
        <ErrorBoundary>
          <AppRoot />
        </ErrorBoundary>
      </ThemeProvider>
    </React.StrictMode>
  );
}

// Wait for DOM to be ready, then initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

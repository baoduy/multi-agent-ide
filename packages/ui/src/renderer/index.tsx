import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { MainPage } from "./pages/Main";

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
      <ErrorBoundary>
        <MainPage />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// Wait for DOM to be ready, then initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}

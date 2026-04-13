import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { MainPage } from "./pages/Main";
import { ThemeProvider } from "./theme/ThemeProvider";

function enforceLightTheme(): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.remove("dark");
  root.dataset.theme = "light";
}

// Initialize app
function initializeApp(): void {
  enforceLightTheme();

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
          <MainPage />
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

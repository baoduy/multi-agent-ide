import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    // Keep this lightweight until logging service is introduced.
    // eslint-disable-next-line no-console
    console.error("Renderer error boundary captured an error:", error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{ padding: 16, border: "1px solid #fecaca", borderRadius: 8, background: "#fef2f2" }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong.</h2>
          <p style={{ marginBottom: 0 }}>Reload the app to retry.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

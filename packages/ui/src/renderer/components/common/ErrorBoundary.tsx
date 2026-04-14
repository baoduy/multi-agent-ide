import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Renderer error boundary captured an error:", error);
    // eslint-disable-next-line no-console
    console.error("Component stack:", info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error } = this.state;

      return (
        <div style={{ padding: 32, maxWidth: 600, margin: "40px auto", fontFamily: "var(--font-sans)" }}>
          <div style={{ padding: 24, border: "1px solid var(--error-soft-border, #fecaca)", borderRadius: 12, background: "var(--error-soft, #fef2f2)" }}>
            <h2 style={{ marginTop: 0, color: "var(--destructive, #991b1b)", fontSize: 18 }}>Something went wrong</h2>
            <p style={{ color: "var(--foreground, #7f1d1d)", marginBottom: 12 }}>
              The application encountered an unexpected error. Check the developer console for full details.
            </p>
            {error && (
              <pre
                style={{
                  background: "var(--error-soft, #fee2e2)",
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "var(--destructive, #991b1b)",
                  maxHeight: 200,
                  overflow: "auto",
                  margin: "12px 0 0",
                }}
              >
                {error.name}: {error.message}
                {error.stack ? `\n\n${error.stack}` : ""}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: "8px 20px",
                background: "var(--destructive, #991b1b)",
                color: "var(--text-on-primary, white)",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

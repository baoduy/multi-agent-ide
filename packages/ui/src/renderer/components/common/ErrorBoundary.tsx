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
        <div style={{ padding: 16, maxWidth: 560, margin: "24px auto", fontFamily: "var(--font-sans)" }}>
          <div style={{ padding: 12, border: "1px solid var(--error-soft-border)", borderRadius: 8, background: "var(--error-soft)" }}>
            <h2 style={{ marginTop: 0, color: "var(--destructive)", fontSize: 13, fontWeight: 600 }}>Something went wrong</h2>
            <p style={{ color: "var(--foreground)", marginBottom: 8, fontSize: 11 }}>
              The application encountered an unexpected error. Check the developer console for full details.
            </p>
            {error && (
              <pre
                style={{
                  background: "var(--error-soft)",
                  padding: 8,
                  borderRadius: 4,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "var(--destructive)",
                  maxHeight: 180,
                  overflow: "auto",
                  margin: "8px 0 0",
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
                marginTop: 10,
                padding: "4px 12px",
                background: "var(--destructive)",
                color: "var(--text-on-primary, white)",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 11,
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

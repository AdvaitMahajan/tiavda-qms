import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{ width: "56px", height: "56px", background: "#FEF2F2" }}
          >
            <AlertTriangle style={{ width: "28px", height: "28px", color: "#C62828" }} />
          </div>
          <h2
            className="text-lg font-semibold mb-2"
            style={{ fontFamily: "Sora, sans-serif", color: "#0A1929" }}
          >
            Something went wrong
          </h2>
          <p className="text-sm mb-4" style={{ color: "#546E7A", maxWidth: "400px" }}>
            An unexpected error occurred. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-md"
            style={{ background: "linear-gradient(135deg, #1565C0, #2979FF)" }}
          >
            Refresh Page
          </button>
          {this.state.error && (
            <pre
              className="mt-4 text-[13px] text-left p-3 rounded-lg max-w-lg overflow-auto"
              style={{ background: "#F8FAFC", color: "#94A3B8", border: "1px solid #E0E7EF" }}
            >
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

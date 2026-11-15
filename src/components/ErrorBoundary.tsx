import React, { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // If it's a chunk load error, we can automatically reload the page once.
    if (
      error.name === "TypeError" &&
      (error.message.includes("Importing a module script failed") ||
       error.message.includes("Failed to fetch dynamically imported module"))
    ) {
      if (!sessionStorage.getItem("reloaded_for_chunk_error")) {
        sessionStorage.setItem("reloaded_for_chunk_error", "true");
        window.location.reload();
      }
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4">
            <RefreshCw className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
          <p className="text-gray-400 mb-6 max-w-md">
            We had trouble loading this section. This usually happens when the app has been updated in the background.
          </p>
          <button
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
            onClick={() => {
              sessionStorage.removeItem("reloaded_for_chunk_error");
              window.location.reload();
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/errorMonitor";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
    // Ship to production monitoring (Vercel logs) with the component stack
    reportError(error, "react.boundary", info.componentStack?.slice(0, 300) ?? undefined);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
            <p className="text-muted-foreground text-sm">
              {this.state.error?.message ?? "An unexpected error occurred. Please try again."}
            </p>
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

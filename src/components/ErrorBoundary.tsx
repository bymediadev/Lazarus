import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientCrash } from "../lib/crashReporter";

type Props = { children: ReactNode };
type State = { crashed: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientCrash(error.message, `${error.stack ?? ""}\n${info.componentStack ?? ""}`);
  }

  render(): ReactNode {
    if (this.state.crashed) {
      return (
        <div className="login-screen">
          <p className="login-sub">Something broke on this page. Refresh to continue.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

import "./lib/passwordRecovery";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./components/AuthProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import { installCrashReporter } from "./lib/crashReporter";
import "./index.css";

installCrashReporter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);

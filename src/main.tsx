import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

declare global {
  interface Window {
    __hardRefreshForModuleError?: () => void;
  }
}

// Stale chunks can happen after a deploy, but forcing a browser refresh can
// interrupt photo uploads/sign-offs. Log the problem and let the route-level
// error boundary provide a retry without losing the user's current session.
const handleChunkError = (msg: string) => {
  if (!/Importing a module script failed|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)) return;
  console.error("Module chunk failed to load; automatic refresh suppressed to preserve user work.");
};
window.addEventListener("error", (e) => handleChunkError(e?.message || ""));
window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  const reason = e.reason;
  handleChunkError(reason instanceof Error ? reason.message : String(reason || ""));
});

createRoot(document.getElementById("root")!).render(<App />);


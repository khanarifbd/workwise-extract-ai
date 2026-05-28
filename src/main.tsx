import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-recover from stale chunk errors after a new deploy.
// Guard against infinite reload loops: only reload once per ~30s window,
// and never more than twice in a row.
const handleChunkError = (msg: string) => {
  if (!/Importing a module script failed|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)) return;
  const now = Date.now();
  const last = Number(sessionStorage.getItem("chunk_reload_ts") || 0);
  const count = Number(sessionStorage.getItem("chunk_reload_count") || 0);
  if (now - last < 30000 && count >= 2) {
    // Give up — surface the error instead of looping
    console.error("Chunk load failed repeatedly; not reloading again.");
    return;
  }
  sessionStorage.setItem("chunk_reload_ts", String(now));
  sessionStorage.setItem("chunk_reload_count", String(count + 1));
  window.location.reload();
};
window.addEventListener("error", (e) => handleChunkError(e?.message || ""));
window.addEventListener("unhandledrejection", (e: any) => handleChunkError(e?.reason?.message || String(e?.reason || "")));
// Reset the counter after a successful run of ~30s
setTimeout(() => {
  sessionStorage.removeItem("chunk_reload_count");
  sessionStorage.removeItem("chunk_reload_ts");
}, 30000);

createRoot(document.getElementById("root")!).render(<App />);


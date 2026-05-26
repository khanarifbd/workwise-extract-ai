import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-recover from stale chunk errors after a new deploy
window.addEventListener("error", (e) => {
  const msg = e?.message || "";
  if (/Importing a module script failed|Failed to fetch dynamically imported module|ChunkLoadError/i.test(msg)) {
    if (!sessionStorage.getItem("chunk_reload")) {
      sessionStorage.setItem("chunk_reload", "1");
      window.location.reload();
    }
  }
});
window.addEventListener("load", () => sessionStorage.removeItem("chunk_reload"));

createRoot(document.getElementById("root")!).render(<App />);


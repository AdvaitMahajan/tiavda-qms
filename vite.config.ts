import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    // 5173, NOT 8080 — the API owns :8080 locally (VITE_API_URL=http://localhost:8080/api).
    // If Vite also grabbed 8080, every /api/* call hit Vite's SPA fallback and got
    // index.html back (HTTP 200), which surfaced as "x.filter is not a function".
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));

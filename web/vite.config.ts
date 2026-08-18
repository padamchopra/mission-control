import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // In a plain browser the UI has no Electron main process to proxy through, so
  // Vite plays that role: same-origin `/api`, with the bearer header injected
  // here so the token never reaches the page. Set MC_SERVER_URL and MC_TOKEN to
  // develop against a real server; without them the app renders its
  // no-servers state, which is also a state worth looking at.
  server: {
    port: 5173,
    strictPort: true,
    proxy: process.env.MC_SERVER_URL
      ? {
          "/api": {
            target: process.env.MC_SERVER_URL,
            changeOrigin: true,
            ws: true,
            rewrite: (path: string) => path.replace(/^\/api/, ""),
            headers: { Authorization: `Bearer ${process.env.MC_TOKEN ?? ""}` },
          },
        }
      : undefined,
  },
  // Electron loads the build off disk with a file:// URL, so assets must be
  // referenced relatively rather than from the server root.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});

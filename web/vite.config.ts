import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  // Electron loads the build off disk with a file:// URL, so assets must be
  // referenced relatively rather than from the server root.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});

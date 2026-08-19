import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { hostname } from "node:os";
import { fileURLToPath, URL } from "node:url";
import { ensureLocalServer, isLoopback, readHomeConfig, readLocalTarget, stopSpawnedServer } from "./local-server";

const local = readLocalTarget();
const deviceName = isLoopback(local.url)
  ? hostname().replace(/\.local$/, "")
  : (() => {
      try {
        return new URL(local.url).hostname;
      } catch {
        return hostname().replace(/\.local$/, "");
      }
    })();

/// The T3 / Cursor preview talks to Vite over an HTTP tunnel. HMR's websocket
/// often never arrives there, so the window sits on a stale paint after an
/// agent edit. This plugin bumps a version on disk changes and the page polls
/// it over plain HTTP, which the tunnel does carry.
function previewReload(): Plugin {
  return {
    name: "preview-reload",
    apply: "serve",
    configureServer(server) {
      let version = 1;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const bump = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          version += 1;
          server.ws.send({ type: "full-reload" });
        }, 300);
      };
      server.watcher.on("change", bump);
      server.watcher.on("add", bump);
      server.watcher.on("unlink", bump);
      server.middlewares.use("/__dev_version", (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.end(String(version));
      });
    },
  };
}

/// Vite is the app in the browser preview. If this process is up, the local
/// daemon should be too — otherwise Devices looks like a pairing problem.
function ensureRemyServer(): Plugin {
  return {
    name: "ensure-remy-server",
    apply: "serve",
    async configureServer(vite) {
      await ensureLocalServer(fileURLToPath(new URL("../server", import.meta.url)), local);
      vite.httpServer?.once("close", () => stopSpawnedServer());
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), previewReload(), ensureRemyServer()],
  define: {
    "import.meta.env.VITE_REMY_PROXY_DEVICE": JSON.stringify(deviceName),
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // In a plain browser the UI has no Electron main process to proxy through, so
  // Vite plays that role: same-origin `/api`, with the bearer header injected
  // on each request from remy.db so a just-spawned server is usable
  // without restarting Vite. The token never reaches the page.
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: local.url,
        changeOrigin: true,
        ws: true,
        rewrite: (path: string) => path.replace(/^\/api/, ""),
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            const token = process.env.MC_TOKEN || readHomeConfig()?.token;
            if (token) proxyReq.setHeader("Authorization", `Bearer ${token}`);
          });
        },
      },
    },
  },
  // Electron loads the build off disk with a file:// URL, so assets must be
  // referenced relatively rather than from the server root.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});

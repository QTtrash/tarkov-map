import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const entries = {
  main: new URL("index.html", import.meta.url).pathname,
  overlay: new URL("overlay.html", import.meta.url).pathname,
  companion: new URL("companion.html", import.meta.url).pathname,
  signal: new URL("signal.html", import.meta.url).pathname,
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["chrome105", "safari15"],
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      input: mode === "desktop"
        ? { main: entries.main, overlay: entries.overlay, companion: entries.companion }
        : mode === "web"
          ? { companion: entries.companion, signal: entries.signal }
          : entries,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));

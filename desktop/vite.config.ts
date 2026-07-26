/// <reference types="vitest/config" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // 1420 is the Tauri convention; strictPort matters because tauri.conf.json's
  // devUrl points at it explicitly — a silent fallback to 1421 breaks the shell.
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Without this, chokidar tries to watch src-tauri/target's build
      // output and crashes with EBUSY on Windows when cargo has a DLL
      // open mid-link.
      ignored: ["**/src-tauri/**"],
    },
  },
  clearScreen: false,
})

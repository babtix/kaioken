/// <reference types="vitest/config" />
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: { environment: "node" },
  server: {
    port: 5174,
    // `vercel dev` serves the api/ functions; plain `vite dev` proxies to it so
    // the front-end talks to the same paths either way.
    proxy: { "/api": "http://localhost:3000" },
  },
})

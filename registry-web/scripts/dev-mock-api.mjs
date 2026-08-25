// Dev-only mock of the registry API, for previewing the UI without a
// deployed registry or `vercel dev`. It answers the same three routes the
// real serverless functions do (/api/index, /api/ext/[id], /api/validate)
// with data derived from the committed community index, so the browse,
// detail and submit pages all render real-looking content offline.
//
// This is NOT used in production — Vercel serves api/*.ts there. Run it
// alongside `npm run dev` via `npm run dev:mock`.
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const indexPath = join(here, "..", "..", "kaioken v1", "ecosystem", "registry", "community-extensions.json")

/** Load the committed index and add plausible enrichment for the UI. */
function loadIndex() {
  const entries = JSON.parse(readFileSync(indexPath, "utf8"))
  const fake = {
    "babtix.hello-world": { version: "0.1.0", downloads: 128, released_at: "2026-05-01T00:00:00Z" },
    "babtix.mcp-echo": { version: "0.1.0", downloads: 342, released_at: "2026-06-15T00:00:00Z" },
    "babtix.wasm-toolkit": { version: "0.2.0", downloads: 87, released_at: "2026-07-20T00:00:00Z" },
  }
  return entries.map((e) => ({ ...e, ...(fake[e.id] ?? {}) }))
}

const MANIFESTS = {
  "babtix.hello-world": { id: "babtix.hello-world", name: "Hello World", version: "0.1.0", type: "declarative" },
  "babtix.mcp-echo": {
    id: "babtix.mcp-echo", name: "MCP Echo", version: "0.1.0", type: "mcp",
    mcp: { command: "node", args: ["server.js"] },
  },
  "babtix.wasm-toolkit": {
    id: "babtix.wasm-toolkit", name: "WASM Toolkit", version: "0.2.0", type: "wasm",
    wasm: { entry: "dist/plugin.wasm" }, permissions: ["fs:read:workspace"],
  },
}

const READMES = {
  "babtix.hello-world": "# Hello World\n\nThe template extension: one example skill showing the packaging format.\n\n## Steps\n\n1. Say hello.\n2. Replace this with something your project needs.\n",
  "babtix.mcp-echo": "# MCP Echo\n\nA minimal **mcp** extension contributing `echo` and `now` tools over a dependency-free Node stdio server.\n\n> Runs unsandboxed once trusted.\n",
  "babtix.wasm-toolkit": "# WASM Toolkit\n\nA sandboxed **wasm** extension: `word_count` and `read_workspace_file` tools running under wazero.\n\n- no network\n- read-only `/workspace`\n",
}

function detail(id) {
  const entries = loadIndex()
  const entry = entries.find((e) => e.id === id)
  if (!entry) return null
  return {
    entry,
    manifest: MANIFESTS[id] ?? null,
    manifest_problems: [],
    readme: READMES[id] ?? null,
    releases: entry.version
      ? [{ tag: `v${entry.version}`, name: `v${entry.version}`, published_at: entry.released_at ?? "", notes: "Initial public release.", downloads: entry.downloads ?? 0 }]
      : [],
  }
}

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost")
  const path = url.pathname

  if (req.method === "GET" && path === "/api/index") return send(res, 200, loadIndex())

  if (req.method === "GET" && path.startsWith("/api/ext/")) {
    const id = decodeURIComponent(path.slice("/api/ext/".length))
    const d = detail(id)
    return d ? send(res, 200, d) : send(res, 404, { error: { message: `No extension ${JSON.stringify(id)}.` } })
  }

  if (req.method === "POST" && path === "/api/validate") {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      let repo = ""
      try {
        repo = (JSON.parse(raw || "{}").repo ?? "").trim()
      } catch {
        /* ignore */
      }
      repo = repo.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "")
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        return send(res, 400, { error: { message: "Give the repository as owner/repo." } })
      }
      const [owner, name] = repo.split("/")
      send(res, 200, {
        ok: true,
        repo,
        errors: [],
        warnings: ["mock: this dev server does not fetch GitHub — the real /api/validate does"],
        entry: {
          id: `${owner}.${name.replace(/^kaioken-/, "")}`,
          repo,
          name,
          description: "Validated by the dev mock.",
          author: owner,
          type: "declarative",
        },
      })
    })
    return
  }

  send(res, 404, { error: { message: "not found" } })
})

const PORT = 3000
server.listen(PORT, () => console.log(`registry-web dev mock API on http://localhost:${PORT}`))

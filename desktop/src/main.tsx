import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import App from "./App"
import { EXPECTED_CONTRACT, bootstrap, onDaemonDead, onDaemonUp } from "./lib/daemon"
import { api } from "./lib/api"
import "./index.css"

function FatalError({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md text-center">
        <p className="font-mono text-lg font-bold text-kai-rose">{title}</p>
        <p className="mt-2 whitespace-pre-wrap font-mono text-sm text-kai-dim">{message}</p>
      </div>
    </div>
  )
}

/**
 * Both directions of a contract mismatch are fatal, but they have opposite
 * remedies, and guessing wrong sends the user down the wrong path. A daemon
 * behind the app is the R1 installer bug (reinstall / rebuild the sidecar); a
 * daemon ahead of it means the app itself is the stale half.
 */
function contractMessage(got: number): string {
  if (got < EXPECTED_CONTRACT) {
    return (
      `The engine speaks contract v${got}; this app needs v${EXPECTED_CONTRACT}.\n\n` +
      `The installer left an old sidecar behind. Reinstall Kaioken, or run ` +
      `\`npm run sidecar\` from a development checkout.`
    )
  }
  return (
    `The engine speaks contract v${got}; this app only understands ` +
    `v${EXPECTED_CONTRACT}.\n\nThis app is the stale half — update Kaioken.`
  )
}

// createRoot must run at most once per container. Vite can re-evaluate this
// module (HMR, or a reload that races the previous evaluation), and calling
// createRoot twice on #root is a hard React error that blanks the window —
// so the root is cached on the container itself.
type RootHost = HTMLElement & { __kaiRoot?: ReturnType<typeof createRoot> }

function getRoot() {
  const host = document.getElementById("root") as RootHost
  if (!host.__kaiRoot) host.__kaiRoot = createRoot(host)
  return host.__kaiRoot
}

// There is no meaningful UI without a daemon, so there is no point rendering
// one: bootstrap() must resolve before App ever mounts.
async function start() {
  const root = getRoot()

  try {
    await bootstrap()
    // Contract-version guard: block if the daemon's API shape doesn't match.
    const health = await api.health()
    if (health.contract !== EXPECTED_CONTRACT) {
      root.render(
        <FatalError title="version mismatch" message={contractMessage(health.contract)} />
      )
      return
    }
  } catch (err) {
    root.render(
      <FatalError
        title="daemon unavailable"
        message={err instanceof Error ? err.message : String(err)}
      />
    )
    return
  }

  onDaemonDead((message) => root.render(<FatalError title="daemon unavailable" message={message} />))
  // Rust restarts a crashed sidecar on a fresh port + token (docs/01
  // -architecture.md §1.6). Without this listener the SSE reconnect loop in
  // lib/events.ts would keep retrying the old, now-dead port forever.
  onDaemonUp(() => {})

  // HashRouter, not BrowserRouter: production loads from tauri://localhost
  // with no server to rewrite paths, and a hash router is the only thing
  // that survives a reload on a deep route.
  root.render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  )
}

start()

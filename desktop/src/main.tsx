import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { HashRouter } from "react-router-dom"
import App from "./App"
import { bootstrap, onDaemonDead, onDaemonUp } from "./lib/daemon"
import { api } from "./lib/api"
import "./index.css"

const EXPECTED_CONTRACT = 1

function FatalError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md text-center">
        <p className="font-mono text-lg font-bold text-kai-rose">daemon unavailable</p>
        <p className="mt-2 whitespace-pre-wrap font-mono text-sm text-kai-dim">{message}</p>
      </div>
    </div>
  )
}

// There is no meaningful UI without a daemon, so there is no point rendering
// one: bootstrap() must resolve before App ever mounts.
async function start() {
  const root = createRoot(document.getElementById("root")!)

  try {
    await bootstrap()
    // Contract-version guard: block if the daemon's API shape doesn't match.
    const health = await api.health()
    if (health.contract !== EXPECTED_CONTRACT) {
      root.render(
        <FatalError
          message={`Contract version mismatch: daemon=${health.contract}, expected=${EXPECTED_CONTRACT}. Rebuild the sidecar (npm run sidecar).`}
        />
      )
      return
    }
  } catch (err) {
    root.render(<FatalError message={err instanceof Error ? err.message : String(err)} />)
    return
  }

  onDaemonDead((message) => root.render(<FatalError message={message} />))
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

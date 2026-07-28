import { invoke, Channel } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Terminal, type ITheme } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import { useThemeStore } from "@/store/theme"
import "@xterm/xterm/css/xterm.css"

export type TermExit = { id: number; exit_code: number | null }

/**
 * Live xterm instances, keyed by the Rust session id. Deliberately a module
 * map and not zustand state: a Terminal is a stateful, non-serializable
 * object, and keeping it out of the store means scrollback and the shell
 * process survive React unmounts and route navigation for free — components
 * only attach/detach `el`.
 */
type Entry = {
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  opened: boolean
  /**
   * Strong reference to the IPC channel. Tauri's JS Channel deregisters
   * itself via FinalizationRegistry when garbage-collected, which makes the
   * Rust side's send() fail and tears the session down — so the channel must
   * live exactly as long as the session, not as long as createTerm's scope.
   */
  channel: Channel<ArrayBuffer>
}

const registry = new Map<number, Entry>()

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/**
 * Terminal colours derived from the live kai palette, including the full
 * 16-colour ANSI table — shells emit coloured output (PowerShell paints
 * commands, parameters and errors), and xterm's built-in palette is designed
 * for a dark background only, which turns light-theme output invisible. The
 * accent vars already flip with `.light`, so only the greys need the mode
 * switch here.
 */
function buildTheme(): ITheme {
  const light = document.documentElement.classList.contains("light")
  return {
    background: cssVar("--kai-code"),
    foreground: cssVar("--kai-text"),
    cursor: cssVar("--kai-orange"),
    cursorAccent: cssVar("--kai-black"),
    selectionBackground: cssVar("--kai-orange") + "40",
    black: light ? "#111111" : "#080808",
    red: cssVar("--kai-rose"),
    green: cssVar("--kai-green"),
    yellow: cssVar("--kai-amber"),
    blue: cssVar("--kai-blue"),
    magenta: cssVar("--kai-tan"),
    cyan: cssVar("--kai-sage"),
    white: light ? "#5c5c5c" : "#d0d0d0",
    brightBlack: light ? "#5c5c5c" : "#808080",
    brightRed: cssVar("--kai-red"),
    brightGreen: cssVar("--kai-green"),
    brightYellow: cssVar("--kai-amber"),
    brightBlue: cssVar("--kai-blue"),
    brightMagenta: cssVar("--kai-tan"),
    brightCyan: cssVar("--kai-sage"),
    brightWhite: light ? "#111111" : "#eeeeee",
  }
}

// Live terminals must follow a theme toggle — their colours were computed
// from the variables in force at creation time and xterm never re-reads CSS.
useThemeStore.subscribe(() => {
  const theme = buildTheme()
  for (const e of registry.values()) e.term.options.theme = theme
})

/**
 * Spawns a shell (PowerShell on Windows) in `cwd` and returns the session id.
 * Output travels as raw bytes over a point-to-point IPC channel — xterm's own
 * stateful decoder handles UTF-8 sequences split across chunk boundaries, so
 * nothing here may ever decode the stream.
 */
export async function createTerm(cwd: string): Promise<number> {
  const term = new Terminal({
    scrollback: 5000,
    fontFamily: '"JetBrains Mono Variable", ui-monospace, "Cascadia Code", monospace',
    fontSize: 12.5,
    cursorBlink: true,
    theme: buildTheme(),
  })
  // Ctrl+` belongs to the app (panel toggle), not the shell.
  term.attachCustomKeyEventHandler((e) => !(e.ctrlKey && e.code === "Backquote"))

  const fit = new FitAddon()
  term.loadAddon(fit)

  const el = document.createElement("div")
  el.className = "h-full w-full"

  // The channel starts delivering as soon as term_create runs in Rust —
  // usually before the invoke promise resolves with the id — so the handler
  // must exist first and acks for those early bytes are held until it does.
  let id: number | null = null
  let preAckBytes = 0
  const onData = new Channel<ArrayBuffer>()
  onData.onmessage = (msg) => {
    const bytes = new Uint8Array(msg)
    term.write(bytes, () => {
      // The write callback is the ack: backpressure tracks what xterm has
      // actually consumed, not what merely arrived.
      if (id === null) preAckBytes += bytes.byteLength
      else void invoke("term_ack", { id, bytes: bytes.byteLength })
    })
  }
  term.onData((data) => {
    if (id !== null) void invoke("term_write", { id, data })
  })

  const created = await invoke<number>("term_create", {
    cwd,
    cols: term.cols,
    rows: term.rows,
    onData,
  })
  id = created
  if (preAckBytes > 0) {
    void invoke("term_ack", { id, bytes: preAckBytes })
    preAckBytes = 0
  }

  registry.set(created, { term, fit, el, opened: false, channel: onData })
  return created
}

/** The DOM node a TerminalView should attach; null once the session is gone. */
export function termElement(id: number): HTMLDivElement | null {
  return registry.get(id)?.el ?? null
}

/**
 * First-attach initialisation: xterm can only measure glyphs once its element
 * is in the document, so open() and the WebGL addon wait for the view mount.
 */
export function ensureOpen(id: number) {
  const e = registry.get(id)
  if (!e || e.opened || !e.el.isConnected) return
  e.term.open(e.el)
  try {
    const webgl = new WebglAddon()
    // GPU resets happen (WebView2, driver updates); fall back to the DOM
    // renderer rather than leaving a dead canvas.
    webgl.onContextLoss(() => webgl.dispose())
    e.term.loadAddon(webgl)
  } catch {
    // No WebGL: the default renderer is fine, just slower.
  }
  e.opened = true
  fitTerm(id)
}

/** Refit to the container and propagate a real size change to the PTY. */
export function fitTerm(id: number) {
  const e = registry.get(id)
  if (!e || !e.opened) return
  // A hidden or collapsing panel measures 0×0; fitting then corrupts xterm's
  // geometry. Skip — the caller refits when the panel is visible again.
  if (e.el.clientWidth === 0 || e.el.clientHeight === 0) return
  const before = { cols: e.term.cols, rows: e.term.rows }
  e.fit.fit()
  if (e.term.cols !== before.cols || e.term.rows !== before.rows) {
    void invoke("term_resize", { id, cols: e.term.cols, rows: e.term.rows })
  }
}

export function focusTerm(id: number) {
  registry.get(id)?.term.focus()
}

/** Kill the shell process and dispose the xterm instance. */
export async function killTerm(id: number) {
  const e = registry.get(id)
  registry.delete(id)
  e?.term.dispose()
  try {
    await invoke("term_kill", { id })
  } catch {
    // Already gone (shell exited on its own) — nothing to clean up.
  }
}

/** Dispose frontend state for a session whose process already exited. */
export function disposeTerm(id: number) {
  const e = registry.get(id)
  registry.delete(id)
  e?.term.dispose()
}

/** Fires when a shell exits on its own (`exit`, crash, kill). */
export function onTermExit(fn: (ev: TermExit) => void) {
  return listen<TermExit>("term://exit", (e) => fn(e.payload))
}

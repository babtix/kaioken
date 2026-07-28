// A minimal Model Context Protocol server over stdio for Kaioken's mcp
// extension tier. It speaks newline-delimited JSON-RPC 2.0 — exactly what
// cli/internal/ext/mcp.go expects — with no dependencies, so it runs under
// any Node without an install step.
//
// It exposes two trivial tools (echo, now) to show the shape. A real
// extension would do something useful here; the protocol plumbing is the
// part worth copying.
//
// This server runs UNSANDBOXED on the user's machine once trusted. Keep it
// small, keep it readable, and document anything it touches — reviewers and
// users both read this file before trusting it.

const PROTOCOL_VERSION = "2024-11-05"

const TOOLS = [
  {
    name: "echo",
    description: "Echo the given text back.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "text to echo" } },
      required: ["text"],
    },
  },
  {
    name: "now",
    description: "Return the current UTC time in ISO 8601 format.",
    inputSchema: { type: "object", properties: {} },
  },
]

function callTool(name, args) {
  switch (name) {
    case "echo":
      return { content: [{ type: "text", text: `echo: ${args?.text ?? ""}` }] }
    case "now":
      return { content: [{ type: "text", text: new Date().toISOString() }] }
    default:
      return { content: [{ type: "text", text: `unknown tool: ${name}` }], isError: true }
  }
}

function handle(msg) {
  // Notifications (no id) never get a reply; that includes
  // notifications/initialized, which the host sends after the handshake.
  if (msg.id === undefined || msg.id === null) return undefined

  switch (msg.method) {
    case "initialize":
      return reply(msg.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "mcp-echo", version: "0.1.0" },
      })
    case "tools/list":
      return reply(msg.id, { tools: TOOLS })
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {}
      return reply(msg.id, callTool(name, args))
    }
    default:
      // A request we do not implement is answered, not dropped, so the host
      // never blocks waiting on an id it will never see.
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } }
  }
}

function reply(id, result) {
  return { jsonrpc: "2.0", id, result }
}

// Read newline-delimited JSON from stdin, answer line by line.
let buffer = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffer += chunk
  let nl
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim()
    buffer = buffer.slice(nl + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue // ignore unparseable lines rather than crash the server
    }
    const out = handle(msg)
    if (out) process.stdout.write(JSON.stringify(out) + "\n")
  }
})
process.stdin.on("end", () => process.exit(0))

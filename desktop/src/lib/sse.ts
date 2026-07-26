// EventSource cannot send an Authorization header, and a token in the query
// string would leak into logs — so the stream is a fetch() read as a
// ReadableStream, and frames are parsed by hand here. Pure and unit-tested.
export type Frame = { id?: string; event: string; data: string }

/** Feed decoded chunks in; get complete frames out. Handles frames split
 *  across chunk boundaries and CRLF line endings. */
export function createFrameParser() {
  let buf = ""
  return (chunk: string): Frame[] => {
    buf += chunk.replace(/\r\n/g, "\n")
    const out: Frame[] = []
    let i: number
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, i)
      buf = buf.slice(i + 2)
      if (raw.startsWith(":")) continue // heartbeat
      const f: Frame = { event: "message", data: "" }
      for (const line of raw.split("\n")) {
        const c = line.indexOf(":")
        const field = c === -1 ? line : line.slice(0, c)
        const value = c === -1 ? "" : line.slice(c + 1).replace(/^ /, "")
        if (field === "event") f.event = value
        else if (field === "data") f.data += (f.data ? "\n" : "") + value
        else if (field === "id") f.id = value
      }
      out.push(f)
    }
    return out
  }
}

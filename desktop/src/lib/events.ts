import { authHeaders, base } from "./daemon"
import { createFrameParser } from "./sse"
import type { ConnStatus, KaiEvent } from "./types"

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** A single connection for the whole app, owned by App.tsx (once it exists)
 *  and dispatching into the stores by ev.type. Not one subscription per
 *  component — that would multiply the stream N times and reorder events
 *  between consumers. */
export function connectEvents(onEvent: (e: KaiEvent) => void, onStatus: (s: ConnStatus) => void) {
  let lastSeq = 0
  let stopped = false
  let attempt = 0

  ;(async function loop() {
    while (!stopped) {
      try {
        onStatus("connecting")
        const res = await fetch(`${base()}/events?since=${lastSeq}`, { headers: authHeaders() })
        if (!res.ok || !res.body) throw new Error(`events: ${res.status}`)
        onStatus("open")
        attempt = 0
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        const parse = createFrameParser()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          for (const f of parse(value)) {
            if (!f.data || f.event === "ready") continue // connection-lifecycle only
            const ev = JSON.parse(f.data) as KaiEvent
            if (typeof ev.seq === "number") lastSeq = Math.max(lastSeq, ev.seq)
            onEvent({ ...ev, type: ev.type ?? f.event })
          }
        }
      } catch {
        // fall through to backoff
      }
      if (stopped) return
      onStatus("reconnecting")
      await sleep(Math.min(1000 * 2 ** attempt++, 10_000))
    }
  })()

  return () => {
    stopped = true
  }
}

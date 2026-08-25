import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../daemon", () => ({
  base: () => "http://test/v1",
  authHeaders: () => ({ Authorization: "Bearer test" }),
}))

import { connectEvents } from "../events"

function sseStream(raw: string) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(raw))
      controller.close()
    },
  })
}

describe("connectEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("reconnects with the last seen seq and never redelivers an event", async () => {
    const events: Array<{ type: string; seq?: number }> = []
    const statuses: string[] = []

    let call = 0
    const fetchMock = vi.fn(async (url: string | URL) => {
      call++
      const since = new URL(url).searchParams.get("since")
      if (call === 1) {
        expect(since).toBe("0")
        return {
          ok: true,
          body: sseStream(
            'event: ready\ndata: {"port":1}\n\n' +
              'event: chat.delta\ndata: {"type":"chat.delta","seq":1,"text":"a"}\n\n'
          ),
        } as Response
      }
      if (call === 2) {
        // Must resume strictly after the last event actually delivered —
        // not from 0, and not skipping ahead either.
        expect(since).toBe("1")
        return {
          ok: true,
          body: sseStream('event: chat.delta\ndata: {"type":"chat.delta","seq":2,"text":"b"}\n\n'),
        } as Response
      }
      // Keep the connection open indefinitely past the second reconnect so
      // the test can make its assertions without a third call racing in.
      return new Promise<Response>(() => {})
    })
    vi.stubGlobal("fetch", fetchMock)

    const disconnect = connectEvents(
      (e) => events.push({ type: e.type, seq: e.seq }),
      (s) => statuses.push(s)
    )

    // First stream: "ready" is swallowed internally, seq 1 is delivered.
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toEqual({ type: "chat.delta", seq: 1 })

    // The stream closed cleanly, so connectEvents falls through to its
    // reconnect backoff (1s at attempt 0) before dialing again.
    await vi.advanceTimersByTimeAsync(1100)
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(events[1]).toEqual({ type: "chat.delta", seq: 2 })

    // Exactly one delivery each — no redelivery of seq 1 on reconnect.
    expect(events.map((e) => e.seq)).toEqual([1, 2])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    disconnect()
  })
})

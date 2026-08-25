import { describe, expect, it } from "vitest"
import { createFrameParser } from "../sse"

describe("createFrameParser", () => {
  it("parses a single complete frame", () => {
    const parse = createFrameParser()
    const frames = parse('id: 1\nevent: chat.delta\ndata: {"text":"hi"}\n\n')
    expect(frames).toEqual([{ id: "1", event: "chat.delta", data: '{"text":"hi"}' }])
  })

  it("handles a frame split mid data: field across chunks", () => {
    const parse = createFrameParser()
    expect(parse('id: 1\nevent: chat.delta\ndata: {"te')).toEqual([])
    const frames = parse('xt":"hi"}\n\n')
    expect(frames).toEqual([{ id: "1", event: "chat.delta", data: '{"text":"hi"}' }])
  })

  it("joins multi-line data fields with newlines", () => {
    const parse = createFrameParser()
    const frames = parse("event: run.log\ndata: line one\ndata: line two\n\n")
    expect(frames).toEqual([{ event: "run.log", data: "line one\nline two" }])
  })

  it("skips heartbeat comment lines without producing a frame", () => {
    const parse = createFrameParser()
    const frames = parse(': ping\n\nevent: ready\ndata: {"port":1}\n\n')
    expect(frames).toEqual([{ event: "ready", data: '{"port":1}' }])
  })

  it("handles CRLF line endings", () => {
    const parse = createFrameParser()
    const frames = parse('id: 2\r\nevent: chat.delta\r\ndata: {"text":"hi"}\r\n\r\n')
    expect(frames).toEqual([{ id: "2", event: "chat.delta", data: '{"text":"hi"}' }])
  })

  it("holds a trailing partial frame until it completes on the next chunk", () => {
    const parse = createFrameParser()
    const first = parse('event: a\ndata: 1\n\nevent: b\ndata: 2')
    expect(first).toEqual([{ event: "a", data: "1" }])
    const second = parse("\n\n")
    expect(second).toEqual([{ event: "b", data: "2" }])
  })

  it("survives a frame arriving one character at a time", () => {
    const parse = createFrameParser()
    const raw = 'id: 9\nevent: chat.delta\ndata: {"text":"x"}\n\n'
    const collected: ReturnType<typeof parse> = []
    for (const ch of raw) collected.push(...parse(ch))
    expect(collected).toEqual([{ id: "9", event: "chat.delta", data: '{"text":"x"}' }])
  })

  it("parses multiple frames delivered in one chunk", () => {
    const parse = createFrameParser()
    const frames = parse("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n")
    expect(frames).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ])
  })
})

import { afterEach, describe, expect, it } from "vitest"
import { requireDurableStorage, type Res } from "../http"
import { storageMode, storageMustBeDurable } from "../store"

// These tests run with no KV_REST_* variables set, so the store is in its
// in-memory fallback — exactly the state a deployment is in when posts vanish
// minutes after being written. What is pinned here is that a write in that
// state is refused rather than accepted and quietly dropped.

function recorder() {
  const sent: { code?: number; body?: unknown } = {}
  const res: Res = {
    status(code) {
      sent.code = code
      return res
    },
    setHeader() {},
    json(body) {
      sent.body = body
    },
    end() {},
  }
  return { res, sent }
}

const ENV_KEYS = ["VERCEL_ENV", "NODE_ENV"] as const
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("storageMustBeDurable", () => {
  it("demands durability on a production deployment", () => {
    process.env.VERCEL_ENV = "production"
    expect(storageMustBeDurable()).toBe(true)
  })

  it("demands it on previews too — a preview that eats posts still misleads", () => {
    process.env.VERCEL_ENV = "preview"
    expect(storageMustBeDurable()).toBe(true)
  })

  it("leaves local development alone", () => {
    process.env.VERCEL_ENV = "development"
    expect(storageMustBeDurable()).toBe(false)
  })

  it("falls back to NODE_ENV off Vercel", () => {
    delete process.env.VERCEL_ENV
    process.env.NODE_ENV = "production"
    expect(storageMustBeDurable()).toBe(true)
  })
})

describe("requireDurableStorage", () => {
  it("starts from the in-memory fallback in tests", () => {
    expect(storageMode()).toBe("memory")
  })

  it("refuses a write that would be lost, and says why", () => {
    process.env.VERCEL_ENV = "production"
    const { res, sent } = recorder()

    expect(requireDurableStorage(res)).toBe(false)
    expect(sent.code).toBe(503)
    expect(JSON.stringify(sent.body)).toContain("KV_REST_API_URL")
  })

  it("allows the write locally, where losing it costs nothing", () => {
    process.env.VERCEL_ENV = "development"
    const { res, sent } = recorder()

    expect(requireDurableStorage(res)).toBe(true)
    expect(sent.code).toBeUndefined()
  })
})

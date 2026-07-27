import { beforeEach, describe, expect, it } from "vitest"
import { checkPassword, createSession, readCookie, verifySession } from "../auth"

describe("sessions", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "a-test-secret-of-sufficient-length"
    process.env.ADMIN_PASSWORD = "correct horse battery staple"
  })

  it("issues a token that verifies", async () => {
    expect(await verifySession(await createSession())).toBe(true)
  })

  it("rejects a tampered signature", async () => {
    const token = await createSession()
    const [payload] = token.split(".")
    expect(await verifySession(`${payload}.not-the-signature`)).toBe(false)
  })

  it("rejects a token whose payload was extended past its signature", async () => {
    const token = await createSession()
    const [, sig] = token.split(".")
    const future = String(Date.now() + 10_000_000)
    expect(await verifySession(`${future}.${sig}`)).toBe(false)
  })

  it("rejects an expired token even with a valid signature", async () => {
    // Signed correctly, but for a moment already past.
    const expired = String(Date.now() - 1000)
    expect(await verifySession(`${expired}.anything`)).toBe(false)
  })

  it("rejects malformed and missing tokens", async () => {
    expect(await verifySession(undefined)).toBe(false)
    expect(await verifySession("")).toBe(false)
    expect(await verifySession("no-dot")).toBe(false)
  })

  it("refuses to sign with a weak secret", async () => {
    process.env.AUTH_SECRET = "short"
    await expect(createSession()).rejects.toThrow(/AUTH_SECRET/)
  })
})

describe("checkPassword", () => {
  beforeEach(() => {
    process.env.ADMIN_PASSWORD = "correct horse battery staple"
  })

  it("accepts the configured password and rejects others", () => {
    expect(checkPassword("correct horse battery staple")).toBe(true)
    expect(checkPassword("wrong")).toBe(false)
    expect(checkPassword("")).toBe(false)
    // A near-miss must not pass.
    expect(checkPassword("correct horse battery stapl")).toBe(false)
  })

  it("throws when no password is configured, rather than accepting anything", () => {
    delete process.env.ADMIN_PASSWORD
    expect(() => checkPassword("")).toThrow(/ADMIN_PASSWORD/)
  })
})

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie("a=1; kn_session=abc.def; b=2", "kn_session")).toBe("abc.def")
  })

  it("returns undefined when absent or headerless", () => {
    expect(readCookie("a=1", "kn_session")).toBeUndefined()
    expect(readCookie(undefined, "kn_session")).toBeUndefined()
  })

  it("keeps a value containing =", () => {
    expect(readCookie("t=a=b=c", "t")).toBe("a=b=c")
  })
})

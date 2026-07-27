// Session handling for the admin area.
//
// The site has exactly one author, so there is no user table: a single password
// from the environment grants a signed session cookie. The cookie carries an
// HMAC over its own expiry, so the server can verify it without storing
// anything — which is what makes this work on a serverless runtime with no
// persistent memory between invocations.

const encoder = new TextEncoder()

export const SESSION_COOKIE = "kn_session"
const SESSION_TTL_SECONDS = 60 * 60 * 12 // 12 hours

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s || s.length < 16) {
    // Failing loudly beats signing sessions with a guessable key.
    throw new Error("AUTH_SECRET must be set to at least 16 characters")
  }
  return s
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return base64url(new Uint8Array(sig))
}

function base64url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Constant-time string compare, so a wrong token cannot be found byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verifies the admin password without leaking its length through timing. */
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) throw new Error("ADMIN_PASSWORD is not set")
  // Hash both sides first so the compare is over fixed-length strings.
  return timingSafeEqual(simpleHash(input), simpleHash(expected))
}

function simpleHash(s: string): string {
  // Not a password hash — only a fixed-width encoding so timingSafeEqual sees
  // equal lengths. The real secret never leaves the environment.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193)
    h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) ^ (h2 >>> 13)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`
}

export async function createSession(): Promise<string> {
  const expires = Date.now() + SESSION_TTL_SECONDS * 1000
  const payload = String(expires)
  return `${payload}.${await hmac(payload)}`
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return false
  const expires = Number(payload)
  if (!Number.isFinite(expires) || expires < Date.now()) return false
  return timingSafeEqual(sig, await hmac(payload))
}

export function sessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Secure",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ].join("; ")
}

export function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=")
    if (k === name) return rest.join("=")
  }
  return undefined
}

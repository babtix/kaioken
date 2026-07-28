import type { EnrichedEntry, ExtDetail, ValidationReport } from "../../api/_lib/types"

// Thin fetch client for the registry API. Errors carry the server's
// {error:{message}} envelope when present.
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, init)
  const body = await resp.json().catch(() => null)
  if (!resp.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: { message?: string } }).error?.message ?? resp.statusText)
        : resp.statusText
    throw new Error(message)
  }
  return body as T
}

export const api = {
  index: () => req<EnrichedEntry[]>("/api/index"),
  ext: (id: string) => req<ExtDetail>(`/api/ext/${encodeURIComponent(id)}`),
  validate: (repo: string) =>
    req<ValidationReport>("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
    }),
}

export type { EnrichedEntry, ExtDetail, ValidationReport }

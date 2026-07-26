import { ApiError } from "./api"

type ErrorCopy = { sentence: string; action?: string }

const ERROR_COPY: Record<string, ErrorCopy> = {
  unauthorized: { sentence: "Authentication failed.", action: "Restart the app" },
  forbidden_origin: { sentence: "Request blocked by origin policy." },
  bad_request: { sentence: "The request was malformed." },
  workspace_not_found: { sentence: "This workspace is no longer open.", action: "Open a repository" },
  not_found: { sentence: "The requested resource doesn't exist." },
  no_config: { sentence: "No config.yaml — initialize first.", action: "Initialize" },
  no_api_key: { sentence: "No API key for this provider.", action: "Open Settings" },
  run_conflict: { sentence: "A run of this kind is already active." },
  run_not_cancellable: { sentence: "This run has already finished." },
  invalid_yaml: { sentence: "The YAML failed validation." },
  path_escape: { sentence: "Path traversal detected." },
  engine_error: { sentence: "The engine returned an error." },
  provider_error: { sentence: "The LLM provider failed.", action: "Check your key in Settings" },
  already_initialized: { sentence: "This repository is already initialized." },
}

export function humanize(err: unknown): { title: string; body: string; action?: string } {
  if (err instanceof ApiError) {
    const copy = ERROR_COPY[err.code]
    if (copy) {
      return { title: copy.sentence, body: err.detail || err.message, action: copy.action }
    }
    return { title: err.message, body: err.detail || "" }
  }
  const msg = err instanceof Error ? err.message : String(err)
  return { title: msg, body: "" }
}

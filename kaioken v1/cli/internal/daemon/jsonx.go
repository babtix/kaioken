package daemon

import (
	"encoding/json"
	"net/http"
)

// Error codes from docs/02-api-contract.md §2.1. `code` is the stable
// snake_case identifier the front-end branches on; keep this list in sync
// with the contract document.
const (
	codeUnauthorized      = "unauthorized"
	codeForbiddenOrigin   = "forbidden_origin"
	codeBadRequest        = "bad_request"
	codeWorkspaceNotFound = "workspace_not_found"
	codeNotFound          = "not_found"
	codeNoConfig          = "no_config"
	codeNoAPIKey          = "no_api_key"
	codeRunConflict       = "run_conflict"
	codeRunNotCancellable = "run_not_cancellable"
	codeInvalidYAML       = "invalid_yaml"
	codePathEscape        = "path_escape"
	codeEngineError       = "engine_error"
	codeProviderError     = "provider_error"
)

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
}

type errorEnvelope struct {
	Error errorBody `json:"error"`
}

// writeJSON encodes v as the response body with the given status. Errors
// writing the body are swallowed: the status line is already sent, and there
// is nothing more useful to do with a broken connection at that point.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError writes the §2.1 error envelope. detail may be empty; it is
// omitted from the JSON rather than sent as `""`.
func writeError(w http.ResponseWriter, status int, code, message, detail string) {
	writeJSON(w, status, errorEnvelope{Error: errorBody{Code: code, Message: message, Detail: detail}})
}

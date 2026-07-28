// Package version holds the Kaioken build version, shared by the CLI and TUI.
package version

// Version is bumped by hand for release builds; the desktop sidecar build
// overrides it with -ldflags "-X kaioken/internal/version.Version=...", which
// requires a var rather than a const.
var Version = "1.0.0"

// ContractVersion is the API contract version. Bump when any /v1 shape changes
// in a way that would break an older frontend.
// v4: extension management endpoints (/v1/extensions…).
const ContractVersion = 4

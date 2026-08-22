Place the main application in ./cmd/kaioken and produce a binary named kaioken (kaioken.exe on Windows) as shown in the Makefile build target.
Use Go 1.26 as specified in go.mod; do not change the module path.
Manage dependencies exclusively through go.mod; avoid manual edits to go.sum.
Follow idiomatic Go error handling: check errors and return or propagate them appropriately.
Run unit tests with `go test ./...` (or `make test`), static analysis with `go vet ./...` (or `make vet`), and linting with `golangci-lint run ./...` (or `make lint`).
Execute the provided Makefile targets: `make test`, `make vet`, `make lint`, `make check`, `make build`, `make clean` for verification and building.
Import UI components from github.com/charmbracelet/bubbletea and bubbles, and apply styling via lipgloss.
Use the PTY libraries (conpty, creack/pty) for spawning and interacting with shell processes.
Access the system clipboard through github.com/atotto/clipboard.
Parse .gitignore files with github.com/sabhiram/go-gitignore.
Render markdown with github.com/yuin/goldmark.
Load configuration via gopkg.in/yaml.v3 (YAML/JSON settings files).
Keep the module name as `kaioken` and avoid altering the module declaration.

Based on the provided `go.mod` and `Makefile` files, here's the documentation update for the project's build system and dependencies:

## Build System and Dependencies

The project uses Go modules for dependency management as defined in [`go.mod`](go.mod):
- Direct dependencies include:
  - `github.com/atotto/clipboard v0.1.4`
  - `github.com/charmbracelet/bubbles v1.0.0`
  - `github.com/charmbracelet/bubbletea v1.3.10`
  - `github.com/charmbracelet/lipgloss v1.1.1-0.20250404203927-76690c660834`
  - `github.com/sabhiram/go-gitignore v0.0.0-20210923224102-525f6e181f06`
  - `golang.org/x/sync v0.17.0`
  - `gopkg.in/yaml.v3 v3.0.1`
- Numerous indirect dependencies are managed automatically (see full list in [`go.mod`](go.mod))

The build process is managed via [`Makefile`](Makefile) with these targets:
- `test`: Run all unit tests (`go test ./... -count=1`)
- `vet`: Run Go vet static analysis (`go vet ./...`)
- `lint`: Run golangci-lint if installed (skips if missing)
- `check`: Run verification gates (`test` + `vet`)
- `build`: Compile binaries (`go build ./...` + Windows executable `kaioken.exe`)
- `clean`: Remove build artifacts (`rm -f kaioken.exe` or `del kaioken.exe`)

---

*Documentation updated based on current `go.mod` and `Makefile` contents*  
*References: [go.mod](go.md), [Makefile](Makefile)*

<!-- kaioken:files Makefile,go.mod -->

# Installation

This chapter explains how to install kaioken by cloning the repository and installing dependencies.

## Table of Contents
- [Cloning the Repository](#cloning-the-repository)
- [Installing Go](#installing-go)
- [Building the Binary](#building-the-binary)
- [Setting Up API Key](#setting-up-api-key)
- [Verification](#verification)

### Cloning the Repository

Clone the kaioken repository from GitHub to obtain the source code:

```bash
git clone https://github.com/yourusername/kaioken.git
cd kaioken
```

Replace `yourusername` with the actual repository owner. The repository contains the source code structure documented in the [Architecture Overview](../Architecture%20Overview/index.md), including `cli/cmd/kaioken/main.go` as the entry point and internal packages like `cli/internal/tui` and `cli/internal/agent`.

### Installing Go

kaioken requires Go version 1.24 or higher, as specified in the project's `go.mod` file. Install Go from the official website (https://golang.org/doc/install) and verify your installation:

```bash
go version
# Example output: go version go1.24.2 linux/amd64
```

The `cli/go.mod` file declares the module and Go version:

```
module kaioken

go 1.24.2

require (
	github.com/atotto/clipboard v0.1.4
	github.com/charmbracelet/bubbles v1.0.0
	github.com/charmbracelet/bubbletea v1.3.10
	github.com/charmbracelet/lipgloss v1.1.1-0.20250404203927-76690c660834
	github.com/sabhiram/go-gitignore v0.0.0-20210923224102-525f6e181f06
	golang.org/x/sync v0.17.0
	gopkg.in/yaml.v3 v3.0.1
)

require (
	github.com/alecthomas/chroma/v2 v2.20.0 // indirect
	github.com/aymanbagabas/go-osc52/v2 v2.0.1 // indirect
	github.com/aymerick/douceur v0.2.0 // indirect
	github.com/charmbracelet/colorprofile v0.4.1 // indirect
	github.com/charmbracelet/glamour v1.0.0 // indirect
	github.com/charmbracelet/x/ansi v0.11.6 // indirect
	github.com/charmbracelet/x/cellbuf v0.0.15 // indirect
	github.com/charmbracelet/x/exp/slice v0.0.0-20250327172914-2fdc97757edf // indirect
	github.com/charmbracelet/x/term v0.2.2 // indirect
	github.com/clipperhouse/displaywidth v0.9.0 // indirect
	github.com/clipperhouse/stringish v0.1.1 // indirect
	github.com/clipperhouse/uax29/v2 v2.5.0 // indirect
	github.com/dlclark/regexp2 v1.11.5 // indirect
	github.com/erikgeiser/coninput v0.0.0-20211004153227-1c3628e74d0f // indirect
	github.com/gorilla/css v1.0.1 // indirect
	github.com/lucasb-eyer-go-colorful v1.3.0 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/mattn/go-localereader v0.0.1 // indirect
	github.com/mattn/go-runewidth v0.0.19 // indirect
	github.com/microcosm-cc/bluemonday v1.0.27 // indirect
	github.com/muesli/ansi v0.0.0-20230316100256-276c6243b2f6 // indirect
	github.com/muesli/cancelreader v0.2.2 // indirect
	github.com/muesli/reflow v0.3.0 // indirect
	github.com/muesli/termenv v0.16.0 // indirect
	github.com/rivo/uniseg v0.4.7 // indirect
	github.com/sahilm/fuzzy v0.1.1 // indirect
	github.com/xo/terminfo v0.0.0-20220910002029-abceb7e1c41e // indirect
	github.com/yuin/goldmark v1.8.4 // indirect
	github.com/yuin/goldmark-emoji v1.0.6 // indirect
	golang.org/x/net v0.38.0 // indirect
	golang.org/x/sys v0.38.0 // indirect
	golang.org/x/term v0.36.0 // indirect
	golang.org/x/text v0.30.0 // indirect
)
```

### Building the Binary

Once Go is installed, build the kaioken binary from the source:

```bash
go build -o kaioken ./cli/cmd/kaioken
```

This command compiles the executable and places it in the current directory. The output filename (`kaioken` or `kaioken.exe` on Windows) follows standard Go build conventions. The build process depends on all internal packages listed in the [structure](../Architecture%20Overview/index.md#structure), including `cli/internal/config` for configuration loading and `cli/internal/llm/openrouter.go` for LLM provider integration.

### Setting Up API Key

kaioken requires an API key for at least one LLM provider to function. The quick start instructions in `README.md` demonstrate setting an OpenRouter API key:

- Obtain a key from [OpenRouter](https://openrouter.ai/keys)
- Set it as an environment variable:
  - **Linux/macOS**: `export OPENROUTER_API_KEY="sk-or-..."`
  - **Windows PowerShell**: `$env:OPENROUTER_API_KEY = "sk-or-..."`

Alternative providers (OpenAI, Groq, DeepSeek, etc.) are supported via the `/provider` TUI command or configuration file. Refer to the [Configuration](../Configuration/index.md) chapter for detailed provider setup.

### Verification

Verify the installation by checking the help output:

```bash
./kaioken --help
```

This should display the available CLI commands (`init`, `scan`, `plan`, `generate`, `wiki`, `update`, `models`, `status`, `skills`, `hook`, `serve`) as documented in `cli/cmd/kaioken/main.go`. If the binary runs successfully, you can proceed to the [quick start](../Getting%20Started/index.md#quick-start) steps in the README to begin using kaioken with a target repository.

## Referenced Files
- README.md
- cli/go.mod

<!-- kaioken:files go.mod -->

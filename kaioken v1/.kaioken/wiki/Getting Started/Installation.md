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

Replace `yourusername` with the actual repository owner. The repository contains the source code structure documented in the [Architecture Overview](../Architecture%20Overview/index.md), including `cmd/kaioken/main.go` as the entry point and internal packages like `internal/tui` and `internal/agent`.

### Installing Go

kaioken requires Go version 1.24 or higher, as specified in the project's `go.mod` file. Install Go from the official website (https://golang.org/doc/install) and verify your installation:

```bash
go version
# Example output: go version go1.24.2 linux/amd64
```

The `go.mod` file declares the module and Go version:

```
module kaioken

go 1.24.2
```

### Building the Binary

Once Go is installed, build the kaioken binary from the source:

```bash
go build -o kaioken ./cmd/kaioken
```

This command compiles the executable and places it in the current directory. The output filename (`kaioken` or `kaioken.exe` on Windows) follows standard Go build conventions. The build process depends on all internal packages listed in the [structure](../Architecture%20Overview/index.md#structure), including `internal/config` for configuration loading and `internal/llm/openrouter.go` for LLM provider integration.

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

This should display the available CLI commands (`init`, `scan`, `plan`, `generate`, `wiki`, `update`, `models`, `status`, `skills`, `hook`, `serve`) as documented in `cmd/kaioken/main.go`. If the binary runs successfully, you can proceed to the [quick start](../Getting%20Started/index.md#quick-start) steps in the README to begin using kaioken with a target repository.

## Referenced Files
- README.md
- go.mod

<!-- kaioken:files README.md,go.mod -->

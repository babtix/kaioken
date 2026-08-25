package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"kaioken/internal/mcp"
)

const mcpUsage = `kaioken mcp — serve this repository's knowledge over the Model Context Protocol

Usage: kaioken mcp <subcommand> [flags]

Subcommands:
  serve       Start the MCP server (STDIO by default)
  manifest    Write .kaioken/mcp.json and print the client config snippet
  validate    Start the server in-process and check it answers a handshake

Flags:
  -repo <path>        Repository to serve (default: current directory)
  -transport <t>      stdio (default) or http
  -port <n>           Port for -transport http
  -token <hex>        Bearer token for http; omit to use the repo's persisted one
  -no-auth            Disable http bearer auth (loopback only — think first)
  -allow-research     Expose research_run, which spends tokens and hits the web
  -log-level <l>      debug | info | warn | error | off  (default: info)
  -log-file <path>    Write JSONL logs here instead of stderr

Examples:
  kaioken mcp serve
  kaioken mcp serve -transport http -port 3456
  kaioken mcp manifest
`

// mcpFlags are the mcp-specific options. The shared parseFlags handles -repo,
// -port and -token; everything below is parsed here so the global flag set
// does not grow a field per subcommand.
type mcpFlags struct {
	transport     string
	noAuth        bool
	allowResearch bool
	logLevel      string
	logFile       string
}

func parseMCPFlags(argv []string) mcpFlags {
	m := mcpFlags{transport: "stdio", logLevel: "info"}
	for i := 0; i < len(argv); i++ {
		switch argv[i] {
		case "-transport", "--transport":
			if i+1 < len(argv) {
				i++
				m.transport = strings.ToLower(argv[i])
			}
		case "-no-auth", "--no-auth":
			m.noAuth = true
		case "-allow-research", "--allow-research":
			m.allowResearch = true
		case "-log-level", "--log-level":
			if i+1 < len(argv) {
				i++
				m.logLevel = argv[i]
			}
		case "-log-file", "--log-file":
			if i+1 < len(argv) {
				i++
				m.logFile = argv[i]
			}
		}
	}
	return m
}

func cmdMCP(ctx context.Context, f flags, argv []string) error {
	sub := ""
	for _, p := range f.positionals {
		switch p {
		case "serve", "manifest", "validate", "help":
			sub = p
		}
		if sub != "" {
			break
		}
	}
	if sub == "" || sub == "help" {
		fmt.Print(mcpUsage)
		if sub == "" && len(f.positionals) > 0 {
			return fmt.Errorf("unknown mcp subcommand %q", f.positionals[0])
		}
		return nil
	}

	mf := parseMCPFlags(argv)

	switch sub {
	case "serve":
		return mcpServe(ctx, f, mf)
	case "manifest":
		return mcpManifest(f, mf)
	case "validate":
		return mcpValidate(ctx, f, mf)
	}
	return nil
}

func mcpServe(ctx context.Context, f flags, mf mcpFlags) error {
	// STDIO owns stdout for the protocol, so logging never goes there. An
	// explicit log file wins; otherwise stderr, which clients capture.
	logger, err := mcp.NewLogger(mf.logFile, mcp.ParseLevel(mf.logLevel))
	if err != nil {
		return fmt.Errorf("opening log file: %w", err)
	}
	defer logger.Close()

	opts := mcp.Options{
		Repo:          f.repo,
		AllowResearch: mf.allowResearch,
		Log:           logger,
	}

	switch mf.transport {
	case "", "stdio":
		srv, err := mcp.New(opts)
		if err != nil {
			return err
		}
		return srv.ServeStdio(ctx, os.Stdin, os.Stdout)

	case "http":
		if f.port == 0 {
			return fmt.Errorf("-transport http needs -port")
		}
		if !mf.noAuth {
			tok := f.token
			if tok == "" {
				tok, err = mcp.EnsureToken(f.repo)
				if err != nil {
					return err
				}
			}
			opts.Token = tok
		}
		srv, err := mcp.New(opts)
		if err != nil {
			return err
		}
		addr := fmt.Sprintf("127.0.0.1:%d", f.port)
		fmt.Fprintf(os.Stderr, "kaioken mcp on http://%s/mcp (repo %s)\n", addr, srv.Repo())
		if opts.Token != "" {
			fmt.Fprintf(os.Stderr, "bearer token: %s\n", opts.Token)
		} else {
			fmt.Fprintln(os.Stderr, "auth disabled — anything that can reach this port can read the repo")
		}
		return srv.ServeHTTP(ctx, addr)

	default:
		return fmt.Errorf("unknown transport %q — use stdio or http", mf.transport)
	}
}

func mcpManifest(f flags, mf mcpFlags) error {
	srv, err := mcp.New(mcp.Options{Repo: f.repo, AllowResearch: mf.allowResearch})
	if err != nil {
		return err
	}
	path, err := srv.WriteManifest("")
	if err != nil {
		return err
	}
	m := srv.BuildManifest("")

	fmt.Printf("wrote %s — %d tool(s), %d prompt(s)\n\n", path, len(m.Tools), len(m.Prompts))
	for _, w := range m.Warnings {
		fmt.Printf("  ! %s\n", w)
	}
	if len(m.Warnings) > 0 {
		fmt.Println()
	}
	fmt.Println("Add this to your MCP client's config:")
	fmt.Println()
	fmt.Println(m.ClientConfig())
	return nil
}

// mcpValidate drives the server over an in-memory pipe with a real handshake,
// which is the cheapest way to catch a broken tool schema before a client
// does — clients tend to fail silently and just not show the tools.
func mcpValidate(ctx context.Context, f flags, mf mcpFlags) error {
	srv, err := mcp.New(mcp.Options{Repo: f.repo, AllowResearch: mf.allowResearch})
	if err != nil {
		return err
	}

	var in bytes.Buffer
	frames := []string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"kaioken-validate","version":"1"}}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		`{"jsonrpc":"2.0","id":3,"method":"resources/list"}`,
		`{"jsonrpc":"2.0","id":4,"method":"prompts/list"}`,
	}
	for _, fr := range frames {
		in.WriteString(fr + "\n")
	}

	var out bytes.Buffer
	if err := srv.ServeStdio(ctx, &in, &out); err != nil {
		return fmt.Errorf("server loop failed: %w", err)
	}

	dec := json.NewDecoder(&out)
	var (
		tools     int
		resources int
		prompts   int
	)
	for dec.More() {
		var resp struct {
			ID     int `json:"id"`
			Result struct {
				Tools      []json.RawMessage `json:"tools"`
				Resources  []json.RawMessage `json:"resources"`
				Prompts    []json.RawMessage `json:"prompts"`
				ServerInfo struct {
					Name    string `json:"name"`
					Version string `json:"version"`
				} `json:"serverInfo"`
				ProtocolVersion string `json:"protocolVersion"`
			} `json:"result"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := dec.Decode(&resp); err != nil {
			return fmt.Errorf("decoding server output: %w", err)
		}
		if resp.Error != nil {
			return fmt.Errorf("request %d failed: %s", resp.ID, resp.Error.Message)
		}
		switch resp.ID {
		case 1:
			fmt.Printf("  ✓ handshake — %s %s speaking MCP %s\n",
				resp.Result.ServerInfo.Name, resp.Result.ServerInfo.Version, resp.Result.ProtocolVersion)
		case 2:
			tools = len(resp.Result.Tools)
		case 3:
			resources = len(resp.Result.Resources)
		case 4:
			prompts = len(resp.Result.Prompts)
		}
	}

	if tools == 0 {
		return fmt.Errorf("server advertised no tools — that is a bug, not a configuration problem")
	}
	fmt.Printf("  ✓ %d tool(s), %d resource(s), %d prompt(s)\n", tools, resources, prompts)
	fmt.Printf("  ✓ serving %s\n", srv.Repo())

	// Schema validity is what clients actually reject on, and every schema
	// went through the builder — so a failure here means the builder broke.
	for _, t := range srv.Tools() {
		if !json.Valid(t.InputSchema) {
			return fmt.Errorf("tool %s has an invalid input schema", t.Name)
		}
	}
	fmt.Println("  ✓ all tool schemas are valid JSON Schema")
	return nil
}

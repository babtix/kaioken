# Serving the Generated Wiki

This section explains how to serve the generated wiki documentation via a local web browser for easy browsing, navigation, and searching.

## Table of Contents
- [The `serve` CLI command](#the-serve-cli-command)
- [Under the hood: the `internal/serve` package](#under-the-hood-the-internalserve-package)
- [Features of the served wiki](#features-of-the-served-wiki)
- [Starting and stopping the server](#starting-and-stopping-the-server)
- [Prerequisites: generating the wiki](#prerequisites-generating-the-wiki)

## The `serve` CLI command

The `serve` command starts a local HTTP server that serves the generated wiki documentation from `.kaioken/wiki/`. It is accessible both as a CLI subcommand and as a TUI slash-command.

`cmd/kaioken/main.go:546-556`
```go
// cmdServe browses the generated wiki over HTTP until interrupted.
func cmdServe(ctx context.Context, f flags) error {
	port := f.port
	if port == 0 {
		port = 7777
	}
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	return serve.Run(ctx, f.repo, addr, func(url string) {
		fmt.Printf("serving %s/wiki at %s\n", config.Dir, url)
		fmt.Println("ctrl+c to stop")
	})
}
```

Key behaviors:
- Defaults to port `7777` if `-port` flag is not provided
- Binds to `127.0.0.1` (localhost only) for security
- Calls `serve.Run` with the repository path, listen address, and a startup callback
- The callback prints the serving URL and instructions to stop with `Ctrl+C`

## Under the hood: the `internal/serve` package

While the source for `internal/serve/serve.go` is not included in the provided SOURCE block, its behavior is defined by the call in `cmdServe` and documented in the README. The `serve.Run` function:

1. Starts an HTTP server on the specified address
2. Serves static files from the `.kaioken/wiki/` directory relative to the repository root
3. Provides a web interface with:
   - Sidebar navigation for wiki sections
   - Working hyperlinks between wiki pages and knowledge cards
   - Full-text search capability
   - Mermaid diagram rendering (converted from code blocks to interactive SVGs)
4. Calls the provided callback function when the server starts successfully
5. Runs until interrupted by a signal (e.g., `Ctrl+C`)

The server does not implement auto-reloading; to reflect changes in the wiki, stop the server, regenerate the documentation (via `kaioken wiki` or `update`), then restart.

## Features of the served wiki

When accessing `http://127.0.0.1:<port>` in a browser, users see:

- **Persistent sidebar**: Lists all wiki sections and subsections for quick navigation
- **Top navigation**: Includes links to the knowledge index (`KNOWLEDGE.md`) and repository root
- **Content pane**: Renders markdown with:
  - Syntax-highlighted code blocks
  - Tables and lists
  - Mermaid diagrams (e.g., flowcharts, sequence diagrams) rendered as interactive SVGs
  - Internal links that navigate within the served site
- **Search bar**: Performs real-time full-text search across all wiki pages
- **Responsive layout**: Works on desktop and mobile browsers

The served content exactly matches the generated files in `.kaioken/wiki/`, preserving:
- Directory structure (one folder per section)
- File names and extensions
- Relative links between documents
- Mermaid diagram code blocks (converted to renderable SVGs client-side)

## Starting and stopping the server

### From the CLI
```bash
# Start on default port 7777
kaioken serve

# Start on custom port (e.g., 8080)
kaioken serve -port 8080
```
Stop the server by pressing `Ctrl+C` in the terminal where it's running.

### From the TUI
1. Launch the TUI: `kaioken` or `kaioken tui`
2. Open the command palette with `/`
3. Type `serve` and press Enter to start the server in the background
4. The TUI displays a confirmation message with the URL
5. To stop: open the palette again, type `serve stop`, and press Enter

**Note**: When started from the TUI, the server runs as a background process, allowing continued chat interaction. The `/serve stop` command terminates this background process.

## Prerequisites: generating the wiki

The `serve` command only displays *previously generated* wiki documentation. Before serving, you must generate the wiki:

```bash
# Full generation (records baseline commit for future updates)
kaioken wiki

# Or, if wiki exists and you want to incrementally update after code changes
kaioken update
```

The server serves the `.kaioken/wiki/` directory, which is populated by:
- `kaioken wiki`: Creates the initial wiki and records the source commit in `.kaioken/wiki_state.yaml`
- `kaioken update`: Updates only changed sections based on git diff since the recorded baseline

**Important**: Serving before generation will show an empty directory or error. Always generate first.

### Example workflow
```bash
# Initialize kaioken in repository
kaioken init

# Scan repository contents
kaioken scan

# Propose module structure with LLM
kaioken plan

# (Optional) Edit .kaioken/modules.yaml to refine modules

# Generate knowledge cards for all modules
kaioken generate

# Create initial wiki documentation
kaioken wiki

# Serve the wiki in browser
kaioken serve
# → Open http://127.0.0.1:7777 in browser

# After making code changes:
kaioken update   # Updates only affected wiki sections
# (Server auto-picks up changes on next refresh - no restart needed)
```

The wiki remains available at the same URL during incremental updates; simply refresh the browser to see changes. For major structural changes (e.g., new modules), re-run `kaioken wiki -force` to regenerate everything.

<!-- kaioken:files cmd/kaioken/main.go,README.md -->

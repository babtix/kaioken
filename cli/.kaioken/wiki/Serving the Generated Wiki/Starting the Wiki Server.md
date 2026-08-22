# Starting the Wiki Server

## Table of Contents
- [Usage](#usage)
- [Address Specification](#address-specification)
- [Ready Callback](#ready-callback)
- [Routes](#routes)
- [Error Handling](#error-handling)
- [Referenced Files](#referenced-files)

## Usage

The `kaioken serve` command launches a local HTTP server to browse the generated wiki documentation. It requires a repository path and serves the wiki from `.kaioken/wiki/` within that repository. The server must be started after generating the wiki (via `kaioken wiki` or `/wiki` in the TUI) because it validates the existence of the wiki directory before listening.

## Address Specification

The listening address is specified via the `addr` parameter, which follows standard TCP address formatting (host:port or :port). Examples:
- `:8080` – listens on all interfaces, port 8080
- `localhost:8080` – listens only on localhost
- `:0` – lets the OS choose an available port (useful for automated testing)

The address is passed directly to `net.Listen("tcp", addr)`. If the port is already in use or invalid, the server returns an error.

## Ready Callback

When the server successfully binds to the address, it invokes the `ready` callback function (if provided) with the actual URL (e.g., `http://localhost:8080`). This allows the CLI to display a working URL even when port `0` triggers dynamic port assignment. The callback runs in a separate goroutine before the server begins accepting connections.

## Routes

The server registers five HTTP routes via `http.NewServeMux()`:

| Route | Handler Function | Purpose |
|-------|------------------|---------|
| `/` | `handleIndex` | Serves the wiki overview page (README.md or fallback message) with chapter cards |
| `/d/` | `handleDoc` | Serves individual markdown documents from the wiki directory |
| `/search` | `handleSearch` | Provides full-text search across all wiki documents |
| `/graph` | `handleGraphPage` | Renders an interactive graph view of the wiki's knowledge structure |
| `/graph.json` | `handleGraphJSON` | Serves the wiki's knowledge graph as JSON (used by the graph view) |

### Route Details

**Index Page (`/`)**  
Displays the repository wiki's README.md if present, otherwise shows a placeholder. Below the README, it renders chapter cards generated from the wiki directory structure. Each card shows the chapter name, document count, and up to three document titles.

**Document Handler (`/d/`)**  
Strips the `/d/` prefix from the path, resolves the relative path to an absolute file within the wiki directory (blocking path traversal), reads the markdown file (capped at 4MB), converts it to HTML via Goldmark, and renders it within the standard wiki page layout (sidebar, breadcrumbs, meta, etc.).

**Search Handler (`/search`)**  
Accepts a query parameter `q`. For each markdown document in the wiki, it performs a case-insensitive substring search. Results show up to 5 matching lines per document (with matches highlighted in `<mark>` tags), grouped by document. If no matches are found, displays a "No matches" message.

**Graph Page Handler (`/graph`)**  
Renders an interactive graph view displaying wiki documents as nodes and their relationships (contains, links, source) as edges. Clicking a document node navigates to its page via `/d/<rel>`. The view includes controls to filter node types and fit the graph to the window. If no wiki has been generated, displays a message prompting the user to run the wiki command first.

**Graph JSON Handler (`/graph.json`)**  
Serves the wiki's knowledge graph as a JSON payload. This endpoint is used by the graph page to retrieve the graph data. The JSON structure includes nodes (with `id`, `kind`, `title`, and `section`) and edges (with `source`, `target`, and `kind`). Returns HTTP 500 if graph generation fails.

## Error Handling

The server returns errors in these scenarios:
- **Missing wiki directory**: If `.kaioken/wiki/` does not exist in the repository, returns `fmt.Errorf("no generated wiki at %s — run the wiki first", wiki.WikiDir(repo))`.
- **Listen failure**: If `net.Listen` fails (e.g., port in use), returns the underlying error.
- **Runtime errors**: 
  - Markdown rendering errors return HTTP 500 with `render error: <err>`.
  - File read from `handleIndex`, `handleDoc`, or `handleSearch`.
  - Path traversal attempts in `handleDoc` return HTTP 404 ("not found").
  - Non-existent documents return HTTP 404.
  - Graph generation errors return HTTP 500 with `graph error: <err>`.
- **Shutdown**: On context cancellation, initiates a graceful shutdown with a 3-second timeout. Errors during shutdown are ignored unless the server fails due to non-graceful closure (e.g., network error).

## Referenced Files

- `internal/serve/serve.go` – Contains all server implementation details referenced above.

<!-- kaioken:files internal/serve/serve.go -->

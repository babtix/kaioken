Use Server.resolve(rel) to convert wiki-relative paths to absolute paths with security checks against directory traversal.
Render markdown via the Server's goldmark.Markdown instance (initialized with GFM extension and unsafe HTML rendering).
Handle HTTP routes via Server.routes() returning an http.Handler with specific path prefixes: '/', '/d/', '/search'.
Build navigation structure using Server.sections() which reads the wiki directory tree and organizes documents into sections.
Return 404 status for paths that fail resolution or file access, and 500 for markdown rendering errors.
Use Server.page() to wrap document content in standard HTML chrome (sidebar, breadcrumbs, meta, pager, TOC).
In tests, seed wiki content using seedWiki helper which writes markdown files to wiki.WikiDir(repo) subdirectories.
Validate search functionality with case-insensitive queries and verify <mark> tags in highlighted results.
Ensure path escape tests confirm refusal to serve files outside the wiki directory (e.g., '/d/../secret.txt').

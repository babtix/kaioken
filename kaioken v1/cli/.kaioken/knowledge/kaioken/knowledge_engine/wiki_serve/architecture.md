The module centers around the Server struct in serve.go, which holds the repository path and a goldmark markdown processor. The Run function starts an HTTP server that routes requests to handlers for the index, documents, search, and graph views.

Document handling begins with the resolve function (used in handleDoc and handleSearch) to validate paths and prevent directory traversal. Valid markdown files are read, size-capped, and converted to HTML via the Server's goldmark instance. The page function then assembles the full page with sidebar navigation, breadcrumbs, meta information, and optional table of contents.

The graph view is served by handleGraphPage, which embeds the force-graph engine (from assets/graph.js) and a boot script. The boot script fetches graph data from handleGraphJSON (which calls wiki.BuildGraph) and renders it in a canvas, with controls to filter node types and fit the view.

Static site export (in static.go) reuses the same rendering functions by setting the Server's static flag, which changes link generation to relative .html files and omits server-only features like search and graph. The Export function writes the index and each document to files in the output directory.

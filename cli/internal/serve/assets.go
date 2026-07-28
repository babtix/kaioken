package serve

import _ "embed"

// graphJS is the shared force-graph engine, bundled from
// desktop/src/lib/graph/ by desktop/scripts/build-graph-asset.mjs. It is
// generated and committed — `kaioken serve` must work without node. CI runs
// the script with --check to catch a stale artifact.
//
//go:embed assets/graph.js
var graphJS string

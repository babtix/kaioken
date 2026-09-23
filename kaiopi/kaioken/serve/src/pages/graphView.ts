import { GRAPH_ENGINE_JS } from "../graphEngineAsset.ts";
import { STYLE } from "./layout.ts";

/* ------------------------------------------------------------------ graph */

/**
 * The full-bleed force-directed graph view, ported from kaioken v1: a canvas
 * driven by the embedded engine (`graphEngineAsset.ts`), plus a small filter
 * strip. Clicking a doc node navigates to `/d/<path>`; file nodes are inert —
 * there is no editor to open into. This is the one page in the site that
 * carries a script, and the one relationship view rich enough to need one.
 */
export function graphPage(): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Graph · kaioken wiki</title>
<style>${STYLE}${GRAPH_STYLE}</style>
</head>
<body class="graph-page">
<a class="graph-back" href="/wiki">← wiki</a>
<div class="graph-bar">
<label><input type="checkbox" id="f-files" checked> files</label>
<label><input type="checkbox" id="f-contains" checked> contains</label>
<label><input type="checkbox" id="f-links" checked> links</label>
<label><input type="checkbox" id="f-source" checked> source</label>
<button type="button" id="g-fit">fit</button>
<span id="g-stats"></span>
</div>
<div class="graph-main"><canvas id="graph-canvas"></canvas>
<div id="g-empty">no wiki generated yet — run the wiki first</div></div>
<script>${GRAPH_ENGINE_JS}</script>
<script>${GRAPH_BOOT_JS}</script>
</body>
</html>`;
}

const GRAPH_STYLE = `
body.graph-page{display:block;height:100vh;overflow:hidden}
.graph-main{position:relative;width:100%;height:100vh}
#graph-canvas{display:block}
.graph-back{position:fixed;top:14px;left:16px;z-index:5;font-size:13px;color:var(--muted);
  text-decoration:none;background:var(--surface);border:1px solid var(--line);
  border-radius:7px;padding:6px 12px;box-shadow:var(--shadow)}
.graph-back:hover{color:var(--accent);border-color:var(--accent)}
.graph-bar{position:fixed;top:14px;right:16px;z-index:5;display:flex;gap:12px;align-items:center;
  background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 12px;
  font-size:12px;color:var(--muted);box-shadow:var(--shadow)}
.graph-bar label{display:flex;gap:4px;align-items:center;cursor:pointer;user-select:none}
.graph-bar input{accent-color:var(--accent)}
.graph-bar button{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  background:none;border:1px solid var(--line);border-radius:5px;padding:3px 9px;cursor:pointer}
.graph-bar button:hover{color:var(--accent);border-color:var(--accent)}
#g-stats{font-size:11.5px}
#g-empty{display:none;position:absolute;inset:0;align-items:center;justify-content:center;
  color:var(--muted);font-size:14px}`;

/**
 * Wires the embedded engine to the page: fetch the payload, read the palette
 * off the site's own CSS variables, and navigate on doc clicks.
 */
const GRAPH_BOOT_JS = `
(function () {
  var canvas = document.getElementById('graph-canvas');
  var engine = new KaioGraph.GraphEngine();
  engine.mount(canvas);

  function colors() {
    var s = getComputedStyle(document.documentElement);
    var v = function (name, fb) { return (s.getPropertyValue(name).trim()) || fb; };
    return {
      background: 'transparent',
      doc: v('--accent', '#b3341c'),
      file: v('--muted', '#5f6672'),
      section: v('--muted', '#5f6672'),
      edge: v('--line', '#e6e4df'),
      label: v('--muted', '#5f6672'),
      accent: v('--accent', '#b3341c')
    };
  }
  engine.setColors(colors());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    engine.setColors(colors());
  });

  engine.onSelect = function (node) {
    if (node.kind === 'doc' && node.rel) location.href = '/d/' + encodeURI(node.rel);
    /* file nodes are inert: no editor to open into */
  };

  var filters = { files: true, kinds: { contains: true, links: true, source: true } };
  function bind(id, apply) {
    var el = document.getElementById(id);
    el.addEventListener('change', function () { apply(el.checked); engine.setFilters(filters); });
  }
  bind('f-files', function (on) { filters.files = on; });
  bind('f-contains', function (on) { filters.kinds.contains = on; });
  bind('f-links', function (on) { filters.kinds.links = on; });
  bind('f-source', function (on) { filters.kinds.source = on; });
  document.getElementById('g-fit').addEventListener('click', function () { engine.fit(); });

  fetch('/graph.json').then(function (r) { return r.json(); }).then(function (g) {
    engine.setGraph(g);
    document.getElementById('g-stats').textContent =
      g.stats.docs + ' docs · ' + g.stats.files + ' files · ' + g.stats.edges + ' edges';
    if (!g.nodes.length) document.getElementById('g-empty').style.display = 'flex';
  });
})();`;

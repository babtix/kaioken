/**
 * Scans the generated wiki that ships in public/kaioken/wiki and writes a
 * manifest the site uses to build its tree without fetching 71 markdown files.
 *
 *   node scripts/gen-wiki-manifest.mjs
 *
 * Re-run this whenever .kaioken/wiki is re-copied from a fresh kaioken run.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const WIKI = "public/kaioken/wiki"
const OUT = "src/data/wiki-manifest.json"

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * Sections appear in the nav in reading order: setup first, then core
 * concepts, then features, then reference. Unlisted sections sort last,
 * alphabetically.
 */
const SECTION_ORDER = [
  "Getting Started",
  "Architecture Overview",
  "Chat Agent",
  "Knowledge Engine",
  "Terminal User Interface (TUI)",
  "Skills System",
  "Git Integration",
  "Code Mapping and Indexing",
  "Serving the Generated Wiki",
  "Configuration",
  "Development Guide",
]

const sectionRank = (dir) => {
  const i = SECTION_ORDER.indexOf(dir)
  return i === -1 ? SECTION_ORDER.length : i
}

/** Pull the first H1, falling back to the filename. */
function titleOf(body, file) {
  const m = body.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : file.replace(/\.md$/, "")
}

/** The provenance footer records the sources a document was written from. */
function sourcesOf(body) {
  const m = body.match(/<!--\s*kaioken:files\s+([^>]*?)-->/)
  if (!m) return []
  return m[1]
    .trim()
    .split(/[,\s]+/)
    .filter(Boolean)
}

const sections = []
let totalDocs = 0
let totalWords = 0

for (const dir of readdirSync(WIKI).sort()) {
  const dirPath = join(WIKI, dir)
  if (!statSync(dirPath).isDirectory()) continue

  const docs = []
  for (const file of readdirSync(dirPath).sort()) {
    if (!file.endsWith(".md")) continue
    const body = readFileSync(join(dirPath, file), "utf8")
    const words = body.split(/\s+/).filter(Boolean).length
    totalWords += words
    totalDocs += 1
    docs.push({
      slug: slug(file),
      file,
      title: titleOf(body, file),
      words,
      hasMermaid: body.includes("```mermaid"),
      sources: sourcesOf(body),
    })
  }

  // The section's own overview document shares the section name — surface it first.
  docs.sort((a, b) => {
    const aOwn = a.file.replace(/\.md$/, "") === dir
    const bOwn = b.file.replace(/\.md$/, "") === dir
    if (aOwn !== bOwn) return aOwn ? -1 : 1
    return a.title.localeCompare(b.title)
  })

  sections.push({ slug: slug(dir), dir, title: dir, docs })
}

sections.sort(
  (a, b) => sectionRank(a.dir) - sectionRank(b.dir) || a.dir.localeCompare(b.dir)
)

// The wiki's own index page lives at the root rather than inside a section.
let readme = null
try {
  const body = readFileSync(join(WIKI, "README.md"), "utf8")
  const words = body.split(/\s+/).filter(Boolean).length
  totalWords += words
  totalDocs += 1
  readme = { file: "README.md", title: titleOf(body, "README.md"), words }
} catch {
  /* a wiki without an index is still browsable by section */
}

const manifest = {
  generatedFrom: ".kaioken/wiki",
  readme,
  sections,
  stats: { sections: sections.length, documents: totalDocs, words: totalWords },
}

writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n")
console.log(
  `wrote ${OUT}: ${sections.length} sections, ${totalDocs} documents, ${totalWords.toLocaleString()} words`
)

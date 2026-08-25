/**
 * Stage strings the research engine reports, translated into the plain
 * language both the Research screen and the Activity trail render. Shared
 * so the two surfaces fold the exact same event stream into the exact same
 * step labels — one engine, one vocabulary, two windows on it.
 */

export function friendlyStage(msg: string): string {
  if (!msg || msg === "starting") return "Starting"
  if (msg === "planning") return "Planning the research"
  if (msg.startsWith("searching")) return "Searching the web"
  if (msg.startsWith("reading") && msg.includes("pages")) return capitalize(msg)
  if (msg === "reading evidence") return "Reading the evidence"
  if (msg === "checking for gaps") return "Checking for gaps"
  if (msg === "writing the report") return "Writing the report"
  // Hybrid-engine stages: the deep path's scope/plan/dispatch vocabulary and
  // the quality passes that follow both paths.
  if (msg === "scoping the research") return "Scoping the research"
  if (msg === "planning the subtopics") return "Planning the subtopics"
  if (msg.startsWith("wave")) return "Workers researching in parallel"
  if (msg.startsWith("worker ")) return capitalize(msg)
  if (msg === "grounding claims against sources") return "Grounding claims against sources"
  if (msg === "rewriting the report") return "Rewriting the report"
  if (msg.startsWith("cross-checking")) return "Cross-checking load-bearing claims"
  if (msg.startsWith("round")) return capitalize(msg)
  return capitalize(msg)
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

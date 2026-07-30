/**
 * Shapes for the answer surface. These mirror what the research engine
 * already produces (internal/research: Source, Report, the round loop), so a
 * report can be handed to these components without an adapter layer.
 */

export type AnswerSource = {
  /** Citation number. Stable, assigned when the page enters the corpus, and
   *  the only handle prose is allowed to reference. */
  n: number
  url: string
  title: string
}

export type ResearchStep = {
  /** Plain language, not a tool name: "Searching the web" beats
   *  "websearch.Provider.Search". The teardown is explicit that opaque tool
   *  names cost trust. */
  label: string
  detail?: string
  state: "done" | "running" | "pending"
}

export type Answer = {
  question: string
  /** Markdown body. Citation markers are written as [n]. */
  body: string
  sources: AnswerSource[]
  steps: ResearchStep[]
  followUps: string[]
  /** True when the loop hit its round limit with gaps still open. */
  incomplete?: boolean
}

/** hostOf strips a URL down to the domain shown under a source. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

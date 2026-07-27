export type FuzzyMatch = {
  /** Higher is better. Only meaningful relative to other matches of the same query. */
  score: number
  /** Indices in the haystack that the query matched, ascending — for highlighting. */
  indices: number[]
}

/**
 * Subsequence match of `query` against `text`, scored so that the results a
 * person would pick rank first: matches at word boundaries, runs of consecutive
 * characters, and matches in the last path segment all score higher.
 *
 * Both arguments are matched case-insensitively. Returns null when `query` is
 * not a subsequence of `text` at all.
 */
export function fuzzyMatch(text: string, query: string): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, indices: [] }

  const hay = text.toLowerCase()
  const needle = query.toLowerCase()
  const baseStart = hay.lastIndexOf("/") + 1

  // Pass 1: greedily confirm the query is a subsequence at all, and find where
  // its last character can land.
  let qi = 0
  let end = -1
  for (let i = 0; i < hay.length && qi < needle.length; i++) {
    if (hay[i] !== needle[qi]) continue
    end = i
    qi++
  }
  if (qi < needle.length) return null

  // Pass 2: walk back from that last character, pulling every earlier one as
  // far right as it will go. Greedy-forward alone matches the first "s" it
  // sees, so "setup" against "docs/guide/setup.md" would highlight letters
  // scattered across three segments instead of the word actually being looked
  // for. Tightening finds the run, which is both the better highlight and the
  // better score.
  const indices = new Array<number>(needle.length)
  let pos = end
  for (let q = needle.length - 1; q >= 0; q--) {
    while (hay[pos] !== needle[q]) pos--
    let chosen = pos
    if (!isBoundary(hay, chosen)) {
      // Rightmost is not always best: for "gsd" against "Getting Started" it
      // would take the trailing g of "Getting" over the initial one. Prefer an
      // earlier occurrence that starts a word, so long as the query characters
      // before this one still have somewhere to go.
      for (let j = chosen - 1; j >= q; j--) {
        if (hay[j] === needle[q] && isBoundary(hay, j)) {
          chosen = j
          break
        }
      }
    }
    indices[q] = chosen
    pos = chosen - 1
  }

  let score = 0
  let prevMatch = -2
  for (const i of indices) {
    // Word-boundary bonus: the start, or just after a separator.
    if (isBoundary(hay, i)) score += 8
    // Runs read as a real prefix rather than scattered letters.
    if (i === prevMatch + 1) score += 6
    // A hit in the basename beats one in a parent directory.
    if (i >= baseStart) score += 4
    score += 1
    prevMatch = i
  }
  // Prefer the shorter of two otherwise-equal matches — less to read.
  score -= hay.length * 0.05
  return { score, indices }
}

/** A character starts a word when it opens the text or follows a separator. */
function isBoundary(hay: string, i: number): boolean {
  return i === 0 || "/._- ".includes(hay[i - 1])
}

/** True when `query` is a subsequence of `text`. Cheaper than scoring it. */
export function fuzzyMatches(text: string, query: string): boolean {
  return fuzzyMatch(text, query) !== null
}

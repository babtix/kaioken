import type { Approval } from "./types"

export type ParsedDiff = NonNullable<Approval["diff"]>
export type DiffHunk = ParsedDiff["hunks"][number]

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Parses a raw unified diff into the structure DiffView renders, so a patch
 * from `git diff` displays through the same component as an approval's diff.
 *
 * Only the parts a viewer needs are interpreted: hunk headers for line
 * numbering and +/-/space lines for the body. Everything else in a git patch
 * (index lines, mode changes, the "\ No newline at end of file" marker) is
 * metadata that would only ever be shown verbatim, so it is skipped.
 */
export function parseUnifiedDiff(patch: string, path: string): ParsedDiff | null {
  if (!patch.trim()) return null

  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let added = 0
  let removed = 0
  let isNewFile = false
  // Remaining lines the open hunk still expects on each side. A hunk header
  // declares its own length, so this is what says where the hunk ends —
  // without it the newline that terminates every patch reads as one more
  // (blank) context line appended to the last hunk.
  let oldLeft = 0
  let newLeft = 0

  const body = patch.split("\n")
  // Every patch ends with a newline, so the split always leaves an empty tail
  // that is punctuation, not content.
  if (body.at(-1) === "") body.pop()

  for (const raw of body) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw

    const header = HUNK_HEADER.exec(line)
    if (header) {
      current = {
        old_start: Number(header[1]),
        // A hunk header omits the count when it is 1.
        old_lines: header[2] === undefined ? 1 : Number(header[2]),
        new_start: Number(header[3]),
        new_lines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      }
      oldLeft = current.old_lines
      newLeft = current.new_lines
      hunks.push(current)
      continue
    }

    if (current && oldLeft <= 0 && newLeft <= 0) {
      // The hunk is full; anything after it is trailer or the next file's
      // header, neither of which belongs in this one.
      current = null
    }

    if (!current) {
      // Still in the file header. "new file mode" and the /dev/null source are
      // both ways git marks an addition — gitx synthesises the latter for
      // untracked files.
      if (line.startsWith("new file") || line === "--- /dev/null") isNewFile = true
      continue
    }

    // "\ No newline at end of file" annotates the previous line rather than
    // being content of its own.
    if (line.startsWith("\\")) continue

    const op = line[0]
    if (op === "+") {
      added++
      newLeft--
      current.lines.push({ op: "+", text: line.slice(1) })
    } else if (op === "-") {
      removed++
      oldLeft--
      current.lines.push({ op: "-", text: line.slice(1) })
    } else if (op === " " || line === "") {
      // An empty string here is a blank context line whose leading space was
      // trimmed in transit; the hunk's declared length is what decides whether
      // one is still expected, so it is safe to accept.
      oldLeft--
      newLeft--
      current.lines.push({ op: " ", text: line.slice(1) })
    }
    // Anything else (a stray "diff --git" starting the next file) is not hunk
    // content; a single-path diff never has one, so it is simply ignored.
  }

  if (hunks.length === 0) return null
  return { path, kind: isNewFile ? "added" : "modified", is_new_file: isNewFile, added, removed, hunks }
}

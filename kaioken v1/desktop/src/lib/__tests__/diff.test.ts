import { describe, expect, it } from "vitest"
import { parseUnifiedDiff } from "../diff"

const MODIFIED = `diff --git a/src/app.ts b/src/app.ts
index 1234567..89abcde 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { run } from "./run"
-const x = 1
+const x = 2
+const y = 3
 export { x }
`

const NEW_FILE = `diff --git a/fresh.go b/fresh.go
new file mode 100644
--- /dev/null
+++ b/fresh.go
@@ -0,0 +1,2 @@
+package fresh
+func F() {}
`

describe("parseUnifiedDiff", () => {
  it("parses hunk headers, ops and line counts", () => {
    const d = parseUnifiedDiff(MODIFIED, "src/app.ts")!
    expect(d.path).toBe("src/app.ts")
    expect(d.is_new_file).toBe(false)
    expect(d.added).toBe(2)
    expect(d.removed).toBe(1)
    expect(d.hunks).toHaveLength(1)

    const h = d.hunks[0]
    expect(h.old_start).toBe(1)
    expect(h.old_lines).toBe(3)
    expect(h.new_start).toBe(1)
    expect(h.new_lines).toBe(4)
    expect(h.lines.map((l) => l.op)).toEqual([" ", "-", "+", "+", " "])
    expect(h.lines[2].text).toBe('const x = 2')
  })

  it("recognises an addition against /dev/null as a new file", () => {
    const d = parseUnifiedDiff(NEW_FILE, "fresh.go")!
    expect(d.is_new_file).toBe(true)
    expect(d.kind).toBe("added")
    expect(d.added).toBe(2)
    expect(d.removed).toBe(0)
    expect(d.hunks[0].old_start).toBe(0)
  })

  it("defaults an omitted hunk count to 1", () => {
    // git writes "@@ -3 +3 @@" rather than "-3,1 +3,1" for single-line hunks.
    const d = parseUnifiedDiff(
      `--- a/x\n+++ b/x\n@@ -3 +3 @@\n-old\n+new\n`,
      "x"
    )!
    expect(d.hunks[0].old_lines).toBe(1)
    expect(d.hunks[0].new_lines).toBe(1)
  })

  it("ignores the no-newline marker rather than treating it as content", () => {
    const d = parseUnifiedDiff(
      `--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n`,
      "x"
    )!
    expect(d.hunks[0].lines.map((l) => l.op)).toEqual(["-", "+"])
    expect(d.added).toBe(1)
    expect(d.removed).toBe(1)
  })

  it("handles multiple hunks in one patch", () => {
    const d = parseUnifiedDiff(
      `--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-a\n+b\n c\n@@ -10,2 +10,3 @@\n d\n+e\n`,
      "x"
    )!
    expect(d.hunks).toHaveLength(2)
    expect(d.hunks[1].old_start).toBe(10)
    expect(d.added).toBe(2)
  })

  it("strips carriage returns so a CRLF patch parses the same", () => {
    const d = parseUnifiedDiff(MODIFIED.replace(/\n/g, "\r\n"), "src/app.ts")!
    expect(d.added).toBe(2)
    expect(d.hunks[0].lines[2].text).toBe("const x = 2")
  })

  it("returns null for an empty patch or one with no hunks", () => {
    expect(parseUnifiedDiff("", "x")).toBeNull()
    expect(parseUnifiedDiff("   \n  ", "x")).toBeNull()
    expect(parseUnifiedDiff("diff --git a/x b/x\nindex 1..2 100644\n", "x")).toBeNull()
  })
})

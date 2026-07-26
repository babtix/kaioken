import { describe, expect, it } from "vitest"
import { filterCommands, resolveCommand } from "../slash"
import { detectTrigger } from "@/components/chat/Autocomplete"

describe("detectTrigger", () => {
  it("opens the slash menu only at the start of the composer", () => {
    expect(detectTrigger("/wik", 4)).toEqual({ kind: "slash", query: "wik", start: 0 })
    // Mid-line "/" is a path separator or prose, not a command.
    expect(detectTrigger("look at src/wik", 15)?.kind).not.toBe("slash")
  })

  it("closes the slash menu once arguments are being typed", () => {
    // A space means the command name is settled — same rule as the TUI.
    expect(detectTrigger("/wiki x3", 8)).toBeNull()
  })

  it("opens the file menu on @ anywhere in the line", () => {
    expect(detectTrigger("explain @too", 12)).toEqual({ kind: "at", query: "too", start: 8 })
    expect(detectTrigger("@main", 5)).toEqual({ kind: "at", query: "main", start: 0 })
  })

  it("ignores an @ that is not starting a word", () => {
    // An email address must not open the file picker.
    expect(detectTrigger("mail me@example.com", 19)).toBeNull()
  })

  it("closes the file menu once the query runs past a space", () => {
    expect(detectTrigger("@src/main.go and then", 21)).toBeNull()
  })

  it("uses the caret, not the end of the line", () => {
    // Caret sits right after "@ag"; the trailing text must not leak in.
    expect(detectTrigger("@ag rest of line", 3)).toEqual({ kind: "at", query: "ag", start: 0 })
  })
})

describe("filterCommands", () => {
  it("ranks a name prefix above a mid-name match", () => {
    const names = filterCommands("up").map((c) => c.name)
    expect(names[0]).toBe("update")
  })

  it("requires three characters before matching mid-name", () => {
    // "/w" must not drag in "new" via a substring hit.
    expect(filterCommands("w").map((c) => c.name)).not.toContain("new")
  })

  it("matches aliases", () => {
    expect(filterCommands("gen").map((c) => c.name)).toContain("cards")
  })

  it("returns everything for an empty prefix", () => {
    expect(filterCommands("").length).toBeGreaterThan(10)
  })
})

describe("resolveCommand", () => {
  it("parses an xN multiplier into run params", () => {
    const r = resolveCommand("/wiki x7")
    expect(r).not.toBeNull()
    expect(r!.cmd.action(r!.arg)).toEqual({
      kind: "run",
      runKind: "wiki",
      params: { multiplier: 7, force: false },
    })
  })

  it("defaults the multiplier to 3 and clamps out-of-range values", () => {
    const bare = resolveCommand("/wiki")!
    expect(bare.cmd.action(bare.arg)).toMatchObject({ params: { multiplier: 3 } })
    const huge = resolveCommand("/wiki x99")!
    expect(huge.cmd.action(huge.arg)).toMatchObject({ params: { multiplier: 10 } })
  })

  it("routes wiki retry to the wiki_retry run kind", () => {
    const r = resolveCommand("/wiki retry")!
    expect(r.cmd.action(r.arg)).toMatchObject({ runKind: "wiki_retry" })
  })

  it("picks up the force flag", () => {
    const r = resolveCommand("/skills force")!
    expect(r.cmd.action(r.arg)).toEqual({
      kind: "run",
      runKind: "skills",
      params: { force: true },
    })
  })

  it("returns null for prose and unknown commands, so they send as messages", () => {
    expect(resolveCommand("what does /wiki do?")).toBeNull()
    expect(resolveCommand("/notacommand")).toBeNull()
  })
})

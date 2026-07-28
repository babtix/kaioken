import { describe, expect, it } from "vitest"
import {
  entryFromManifest,
  kebab,
  parseManifest,
  parseSemver,
  validateManifest,
  validId,
} from "../manifest.js"

// These cases mirror cli/internal/ext manifest_test.go and semver_test.go.
// If a rule changes on either side, this file is what catches the drift.

describe("parseSemver (mirrors ext.parseSemver)", () => {
  it("accepts strict MAJOR.MINOR.PATCH with optional leading v", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3])
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3])
    expect(parseSemver("0.0.1")).toEqual([0, 0, 1])
    expect(parseSemver("10.0.20")).toEqual([10, 0, 20])
  })
  it("rejects everything the Go parser rejects", () => {
    for (const bad of ["", "1.2", "1.2.3.4", "1.2.x", "1.02.3", "-1.2.3", "1.2.3-beta"]) {
      expect(parseSemver(bad), bad).toBeNull()
    }
  })
})

describe("id rules (mirror ext.validateID)", () => {
  it("accepts owner.name in kebab", () => {
    expect(validId("alice.git-flow")).toBe(true)
    expect(validId("a1.b2")).toBe(true)
  })
  it("rejects bad shapes", () => {
    for (const bad of ["Alice.Demo", "alice", "alice.demo.extra", "alice.-demo", "alice.demo-", ".demo", "alice."]) {
      expect(validId(bad), bad).toBe(false)
    }
    expect(kebab("UPPER")).toBe(false)
  })
})

describe("validateManifest (mirrors Manifest.Validate)", () => {
  const base = { id: "alice.demo", name: "Demo", version: "1.0.0" }

  it("accepts a clean declarative manifest", () => {
    expect(validateManifest(base)).toEqual([])
    expect(validateManifest({ ...base, type: "declarative" })).toEqual([])
  })

  it("rejects bad id, missing name, bad semver", () => {
    expect(validateManifest({ ...base, id: "Bad.Id" }).join()).toContain("invalid extension id")
    expect(validateManifest({ ...base, name: " " }).join()).toContain("no name")
    expect(validateManifest({ ...base, version: "1.2" }).join()).toContain("invalid version")
  })

  it("rejects unknown types like the installer does", () => {
    for (const t of ["native", "python"]) {
      expect(validateManifest({ ...base, type: t }).join()).toContain("not supported yet")
    }
  })

  it("keeps executable payloads off declarative extensions", () => {
    expect(validateManifest({ ...base, mcp: { command: "node" } }).join()).toContain(
      "must not declare an mcp server",
    )
    expect(validateManifest({ ...base, wasm: { entry: "a.wasm" } }).join()).toContain(
      "must not declare a wasm module",
    )
  })

  it("mcp requires a command", () => {
    expect(validateManifest({ ...base, type: "mcp" }).join()).toContain("must declare mcp.command")
    expect(validateManifest({ ...base, type: "mcp", mcp: { command: " " } }).join()).toContain(
      "must declare mcp.command",
    )
    expect(validateManifest({ ...base, type: "mcp", mcp: { command: "node" } })).toEqual([])
  })

  it("wasm requires a contained .wasm entry", () => {
    expect(validateManifest({ ...base, type: "wasm" }).join()).toContain("must declare wasm.entry")
    for (const bad of ["dist/plugin.js", "/abs/plugin.wasm", "../out.wasm", "dist/../../x.wasm", "C:/x.wasm"]) {
      expect(
        validateManifest({ ...base, type: "wasm", wasm: { entry: bad } }).join(),
        bad,
      ).toContain("relative .wasm path")
    }
    expect(validateManifest({ ...base, type: "wasm", wasm: { entry: "dist/plugin.wasm" } })).toEqual([])
  })

  it("permissions: wasm-only and known-set-only", () => {
    expect(validateManifest({ ...base, permissions: ["fs:read:workspace"] }).join()).toContain(
      "wasm extensions only",
    )
    expect(
      validateManifest({
        ...base,
        type: "wasm",
        wasm: { entry: "a.wasm" },
        permissions: ["net:example.com"],
      }).join(),
    ).toContain("not supported yet")
    expect(
      validateManifest({
        ...base,
        type: "wasm",
        wasm: { entry: "a.wasm" },
        permissions: ["fs:read:workspace"],
      }),
    ).toEqual([])
  })

  it("minKaiokenVersion must be semver when present", () => {
    expect(validateManifest({ ...base, minKaiokenVersion: "not-a-version" }).join()).toContain(
      "invalid minKaiokenVersion",
    )
    expect(validateManifest({ ...base, minKaiokenVersion: "0.2.0" })).toEqual([])
  })
})

describe("parseManifest", () => {
  it("parses real manifest YAML", () => {
    const { manifest, error } = parseManifest(
      "id: alice.demo\nname: Demo\nversion: 1.0.0\ntype: mcp\nmcp:\n  command: node\n  args: [server.js]\n",
    )
    expect(error).toBeUndefined()
    expect(manifest?.id).toBe("alice.demo")
    expect(manifest?.mcp?.command).toBe("node")
    expect(manifest?.mcp?.args).toEqual(["server.js"])
  })
  it("reports unparseable and non-mapping input", () => {
    expect(parseManifest("{unclosed").error).toBeTruthy()
    expect(parseManifest("- just\n- a list\n").error).toContain("not a YAML mapping")
  })
})

describe("entryFromManifest", () => {
  it("builds a ready-to-paste entry, normalizing the type", () => {
    expect(
      entryFromManifest({ id: "alice.demo", name: "Demo", description: "d", author: "Alice" }, "alice/kaioken-demo"),
    ).toEqual({
      id: "alice.demo",
      repo: "alice/kaioken-demo",
      name: "Demo",
      description: "d",
      author: "Alice",
      type: "declarative",
    })
  })
  it("carries wasm permissions so a listing can never understate them", () => {
    const e = entryFromManifest(
      { id: "b.w", name: "W", type: "wasm", wasm: { entry: "a.wasm" }, permissions: ["fs:read:workspace"] },
      "b/w",
    )
    expect(e.permissions).toEqual(["fs:read:workspace"])
  })
})

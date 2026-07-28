// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import ApprovalDialog from "../chat/ApprovalDialog"
import type { Approval } from "@/lib/types"

afterEach(cleanup)

function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    approval_id: "ap1",
    run_id: "r1",
    workspace_id: "w1",
    action: "edit",
    target: "internal/agent/agent.go",
    preview: "",
    diff: {
      path: "internal/agent/agent.go",
      kind: "edit",
      is_new_file: false,
      added: 3,
      removed: 1,
      hunks: [
        {
          old_start: 1,
          old_lines: 2,
          new_start: 1,
          new_lines: 4,
          lines: [
            { op: " ", text: "package agent" },
            { op: "+", text: "// new line" },
          ],
        },
      ],
    },
    command: null,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    ...overrides,
  }
}

describe("ApprovalDialog", () => {
  it("renders nothing without an approval", () => {
    const { container } = render(<ApprovalDialog approval={null} onResolve={vi.fn()} />)
    expect(container.innerHTML).toBe("")
  })

  it("shows the edit action, target, and diff stats", () => {
    render(<ApprovalDialog approval={makeApproval()} onResolve={vi.fn()} />)
    expect(screen.getByText("Edit file")).toBeTruthy()
    expect(screen.getByText("internal/agent/agent.go")).toBeTruthy()
    expect(screen.getByText("+3")).toBeTruthy()
    expect(screen.getByText("−1")).toBeTruthy()
  })

  it("Y approves, N denies, A approves the rest of the run", () => {
    const onResolve = vi.fn()
    render(<ApprovalDialog approval={makeApproval()} onResolve={onResolve} />)
    fireEvent.keyDown(document, { key: "y" })
    expect(onResolve).toHaveBeenLastCalledWith("approve")
    fireEvent.keyDown(document, { key: "n" })
    expect(onResolve).toHaveBeenLastCalledWith("deny")
    fireEvent.keyDown(document, { key: "a" })
    expect(onResolve).toHaveBeenLastCalledWith("approve_all")
  })

  it("run approvals show the command and refuse blanket approval", () => {
    const onResolve = vi.fn()
    render(
      <ApprovalDialog
        approval={makeApproval({ action: "run", command: "rm -rf build", diff: null })}
        onResolve={onResolve}
      />
    )
    expect(screen.getByText("Run command")).toBeTruthy()
    expect(screen.getByText("rm -rf build")).toBeTruthy()
    // No "approve all" escape hatch for shell commands…
    expect(screen.queryByText(/Approve all/)).toBeNull()
    // …and the A shortcut is inert.
    fireEvent.keyDown(document, { key: "a" })
    expect(onResolve).not.toHaveBeenCalled()
  })

  it("Escape resolves as a denial, never an implicit approval", () => {
    const onResolve = vi.fn()
    render(<ApprovalDialog approval={makeApproval()} onResolve={onResolve} />)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onResolve).toHaveBeenCalledWith("deny")
  })

  it("focus lands on Deny so a stray Enter cannot authorise a write", () => {
    render(<ApprovalDialog approval={makeApproval()} onResolve={vi.fn()} />)
    const deny = screen.getByText("Deny").closest("button")
    expect(document.activeElement).toBe(deny)
  })
})

import { useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useEditorStore } from "@/store/editor"
import { useExplorerStore } from "@/store/explorer"
import { useWorkspaceStore } from "@/store/workspace"

/**
 * The single "the user picked a file" action, shared by the tree, the recents
 * list and the quick switcher.
 *
 * Each of those used to only highlight the row, which meant clicking a file did
 * nothing visible. Now it also opens the file in the editor and navigates
 * there, so a click has an outcome wherever it happens.
 */
export function useOpenFile() {
  const ws = useWorkspaceStore((s) => s.active)
  const open = useEditorStore((s) => s.open)
  const selectFile = useExplorerStore((s) => s.selectFile)
  const addRecent = useExplorerStore((s) => s.addRecent)
  const navigate = useNavigate()

  return useCallback(
    (path: string) => {
      selectFile(path)
      addRecent(path)
      if (!ws) return
      void open(ws.id, path)
      navigate("/editor")
    },
    [ws?.id, open, selectFile, addRecent, navigate]
  )
}

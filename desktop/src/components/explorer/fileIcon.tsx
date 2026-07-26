import {
  File,
  FileCode,
  FileJson,
  FileText,
  Image,
  type LucideIcon,
} from "lucide-react"

// A minimal file-type classifier: pick an icon and a tint by extension. The
// desktop app reuses the same kai-* tokens as the rest of the UI, so the tree
// reads as part of the app rather than a generic file list. Kept here so both
// the file tree and the recent/pinned panel stay in sync.

type IconSpec = { icon: LucideIcon; color: string }

const PLAIN: IconSpec = { icon: File, color: "text-kai-dim" }

const BY_EXT: Record<string, IconSpec> = {
  ".go": { icon: FileCode, color: "text-kai-blue" },
  ".ts": { icon: FileCode, color: "text-kai-blue" },
  ".tsx": { icon: FileCode, color: "text-kai-blue" },
  ".js": { icon: FileCode, color: "text-kai-amber" },
  ".jsx": { icon: FileCode, color: "text-kai-amber" },
  ".mjs": { icon: FileCode, color: "text-kai-amber" },
  ".py": { icon: FileCode, color: "text-kai-green" },
  ".rs": { icon: FileCode, color: "text-kai-orange" },
  ".json": { icon: FileJson, color: "text-kai-amber" },
  ".yaml": { icon: FileText, color: "text-kai-green" },
  ".yml": { icon: FileText, color: "text-kai-green" },
  ".toml": { icon: FileText, color: "text-kai-orange" },
  ".md": { icon: FileText, color: "text-kai-text" },
  ".html": { icon: FileCode, color: "text-kai-orange" },
  ".css": { icon: FileCode, color: "text-kai-blue" },
  ".sh": { icon: FileText, color: "text-kai-green" },
  ".svg": { icon: Image, color: "text-kai-rose" },
  ".png": { icon: Image, color: "text-kai-rose" },
  ".jpg": { icon: Image, color: "text-kai-rose" },
  ".jpeg": { icon: Image, color: "text-kai-rose" },
}

export function fileIconSpec(ext: string | undefined): IconSpec {
  if (!ext) return PLAIN
  return BY_EXT[ext.toLowerCase()] ?? PLAIN
}

export function fileIcon(ext: string | undefined): LucideIcon {
  return fileIconSpec(ext).icon
}

export function fileIconColor(ext: string | undefined): string {
  return fileIconSpec(ext).color
}

// pathExt returns the lowercased extension of a repo-relative path, or
// undefined when there is none. Shared by the panels that render file rows
// from a bare path (git changes, recent/pinned) rather than a tree node.
export function pathExt(path: string): string | undefined {
  const i = path.lastIndexOf(".")
  if (i <= path.lastIndexOf("/")) return undefined
  return path.slice(i).toLowerCase()
}

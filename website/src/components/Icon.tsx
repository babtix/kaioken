import * as React from "react"
import {
  Activity,
  BookOpenText,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  Code2,
  Cpu,
  FolderGit2,
  GitMerge,
  Globe,
  Languages,
  Layout,
  Library,
  MessageSquareCode,
  Plug,
  Puzzle,
  RefreshCw,
  Ruler,
  ScanText,
  SearchCode,
  ShieldCheck,
  Terminal,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"

/**
 * Content files reference icons by name so the copy stays free of imports.
 * Registering them explicitly keeps tree-shaking working.
 */
const REGISTRY: Record<string, LucideIcon> = {
  Activity,
  BookOpenText,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  Code2,
  Cpu,
  FolderGit2,
  GitMerge,
  Globe,
  Languages,
  Layout,
  Library,
  MessageSquareCode,
  Plug,
  Puzzle,
  RefreshCw,
  Ruler,
  ScanText,
  SearchCode,
  ShieldCheck,
  Terminal,
  Users,
  Wrench,
  Zap,
}

export default function Icon({
  name,
  ...props
}: { name: string } & React.ComponentProps<LucideIcon>) {
  const Cmp = REGISTRY[name] ?? Terminal
  return <Cmp {...props} />
}

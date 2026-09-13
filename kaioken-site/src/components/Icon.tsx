import * as React from "react"
import {
  Activity,
  BookOpen,
  BookOpenText,
  Boxes,
  BrainCircuit,
  Check,
  ClipboardCheck,
  Code2,
  Cpu,
  FolderGit2,
  FolderOpen,
  GitMerge,
  Globe,
  Languages,
  Layers,
  Layout,
  Library,
  MessageSquare,
  MessageSquareCode,
  MonitorSmartphone,
  Plug,
  Puzzle,
  Radar,
  RefreshCw,
  Ruler,
  ScanText,
  SearchCode,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  Wallet,
  Waypoints,
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
  BookOpen,
  BookOpenText,
  Boxes,
  BrainCircuit,
  Check,
  ClipboardCheck,
  Code2,
  Cpu,
  FolderGit2,
  FolderOpen,
  GitMerge,
  Globe,
  Languages,
  Layers,
  Layout,
  Library,
  MessageSquare,
  MessageSquareCode,
  MonitorSmartphone,
  Plug,
  Puzzle,
  Radar,
  RefreshCw,
  Ruler,
  ScanText,
  SearchCode,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  Wallet,
  Waypoints,
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

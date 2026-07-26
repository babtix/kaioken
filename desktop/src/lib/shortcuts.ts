export type Shortcut = {
  keys: string
  label: string
  group: string
}

// Single source of truth for all keyboard shortcuts.
export const SHORTCUTS: Shortcut[] = [
  { keys: "Ctrl+K", label: "Command palette", group: "General" },
  { keys: "Ctrl+P", label: "Quick file switcher", group: "General" },
  { keys: "Ctrl+B", label: "Toggle explorer sidebar", group: "General" },
  { keys: "?", label: "Shortcut help", group: "General" },
  { keys: "Escape", label: "Close dialog", group: "General" },
  { keys: "Ctrl+1", label: "Chat", group: "Navigation" },
  { keys: "Ctrl+2", label: "Wiki", group: "Navigation" },
  { keys: "Ctrl+3", label: "Activity", group: "Navigation" },
  { keys: "Ctrl+4", label: "Cards", group: "Navigation" },
  { keys: "Ctrl+5", label: "Settings", group: "Navigation" },
  { keys: "Ctrl+N", label: "New chat session", group: "Chat" },
  { keys: "Enter", label: "Send message", group: "Chat" },
  { keys: "Alt+Enter", label: "New line", group: "Chat" },
]

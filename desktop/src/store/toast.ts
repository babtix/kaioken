import { create } from "zustand"

export type Toast = {
  id: string
  kind: "info" | "error" | "success"
  title: string
  body?: string
  action?: string
}

type ToastState = {
  toasts: Toast[]
  push: (kind: Toast["kind"], title: string, body?: string, action?: string) => void
  dismiss: (id: string) => void
}

let counter = 0

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (kind, title, body, action) => {
    const id = `t${++counter}`
    set((s) => {
      const toasts = [...s.toasts, { id, kind, title, body, action }]
      // Cap at 5 visible.
      return { toasts: toasts.slice(-5) }
    })
    // Auto-dismiss after 5s.
    setTimeout(() => get().dismiss(id), 5000)
  },

  dismiss: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))

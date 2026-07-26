import { create } from "zustand"
import { api, ApiError } from "@/lib/api"
import { humanize } from "@/lib/errors"
import { useToastStore } from "@/store/toast"
import type { Approval, ChatMessage, KaiEvent, SessionMeta } from "@/lib/types"

type ChatState = {
  // Sessions
  sessions: SessionMeta[]
  activeSessionId: string | null
  // Transcript for the active session
  messages: ChatMessage[]
  // Live streaming buffer (delta text not yet committed)
  streamBuffer: string
  isStreaming: boolean
  activeRunId: string | null
  // Pending approval (blocks the agent)
  approval: Approval | null
  // Error
  error: string | null

  // Actions
  loadSessions: (wsId: string) => Promise<void>
  openSession: (wsId: string, sid: string) => Promise<void>
  newSession: (wsId: string) => Promise<void>
  send: (wsId: string, content: string, opts?: { auto_approve?: boolean; allow_run?: boolean }) => Promise<void>
  cancel: (runId: string) => Promise<void>
  resolveApproval: (decision: "approve" | "deny" | "approve_all") => Promise<void>

  // Event handling
  handleEvent: (ev: KaiEvent) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  streamBuffer: "",
  isStreaming: false,
  activeRunId: null,
  approval: null,
  error: null,

  loadSessions: async (wsId: string) => {
    try {
      const res = await api.listSessions(wsId)
      const list = res.sessions || []
      const currentSid = get().activeSessionId
      const exists = currentSid ? list.some((s) => s.id === currentSid) : false
      set({
        sessions: list,
        activeSessionId: exists ? currentSid : (list[0]?.id ?? null),
      })
    } catch {
      // non-fatal
    }
  },

  openSession: async (wsId: string, sid: string) => {
    try {
      const full = await api.getSession(wsId, sid)
      set({ activeSessionId: sid, messages: full.messages || [], streamBuffer: "", error: null })
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ error: h.title })
    }
  },

  newSession: async (wsId: string) => {
    try {
      const meta = await api.createSession(wsId)
      set((s) => ({
        sessions: [meta, ...(s.sessions || [])],
        activeSessionId: meta.id,
        messages: [],
        streamBuffer: "",
        error: null,
      }))
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ error: h.title })
    }
  },

  send: async (wsId: string, content: string, opts) => {
    let sid = get().activeSessionId
    if (!sid) {
      try {
        const meta = await api.createSession(wsId)
        sid = meta.id
        set((s) => ({
          sessions: [meta, ...(s.sessions || [])],
          activeSessionId: meta.id,
          messages: [],
          streamBuffer: "",
          error: null,
        }))
      } catch (err) {
        const h = humanize(err)
        useToastStore.getState().push("error", h.title, h.body, h.action)
        set({ isStreaming: false, error: h.title })
        return
      }
    }

    set({ isStreaming: true, streamBuffer: "", error: null })
    // Optimistically append the user message.
    set((s) => ({ messages: [...(s.messages || []), { role: "user", content }] }))

    try {
      const res = await api.sendMessage(wsId, sid, content, opts)
      set({ activeRunId: res.run_id })
    } catch (err) {
      // If the session was lost on the server (e.g. daemon restarted or session expired), create a new one and retry
      if (err instanceof ApiError && (err.status === 404 || err.code === "not_found")) {
        try {
          const meta = await api.createSession(wsId)
          set((s) => ({
            sessions: [meta, ...(s.sessions || []).filter((x) => x.id !== sid)],
            activeSessionId: meta.id,
            error: null,
          }))
          const res = await api.sendMessage(wsId, meta.id, content, opts)
          set({ activeRunId: res.run_id })
          return
        } catch {
          // fallback to error reporting if retry fails
        }
      }
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ isStreaming: false, error: h.title })
    }
  },

  cancel: async (runId: string) => {
    try {
      await api.cancelRun(runId)
      // Leave isStreaming alone: run.finished flips it, so the transcript
      // stays coherent if the agent is mid-tool-call when cancel lands.
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
    }
  },

  resolveApproval: async (decision) => {
    const approval = get().approval
    if (!approval) return
    try {
      await api.resolveApproval(approval.approval_id, decision)
      set({ approval: null })
    } catch (err) {
      const h = humanize(err)
      useToastStore.getState().push("error", h.title, h.body, h.action)
      set({ error: h.title })
    }
  },

  handleEvent: (ev: KaiEvent) => {
    const state = get()
    // Only handle events for the active session/run.
    switch (ev.type) {
      case "chat.delta": {
        if (ev.session_id !== state.activeSessionId) return
        set((s) => ({ streamBuffer: (s.streamBuffer || "") + (ev.text as string) }))
        break
      }
      case "chat.message": {
        if (ev.session_id !== state.activeSessionId) return
        const msg: ChatMessage = {
          role: ev.role as ChatMessage["role"],
          content: typeof ev.content === "string" ? ev.content : JSON.stringify(ev.content),
        }
        set((s) => ({
          messages: [...(s.messages || []), msg],
          streamBuffer: "",
        }))
        break
      }
      case "chat.tool_call": {
        if (ev.session_id !== state.activeSessionId) return
        const msg: ChatMessage = {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: (ev.call_id as string) || "",
            type: "function",
            function: { name: ev.name as string, arguments: ev.args as string },
          }],
        }
        set((s) => ({ messages: [...(s.messages || []), msg] }))
        break
      }
      case "chat.tool_result": {
        if (ev.session_id !== state.activeSessionId) return
        const msg: ChatMessage = {
          role: "tool",
          content: (ev.result as string) || "",
          tool_call_id: (ev.call_id as string) || "",
          name: ev.name as string,
        }
        set((s) => ({ messages: [...(s.messages || []), msg] }))
        break
      }
      case "approval.request": {
        const approval = ev.approval as Approval
        set({ approval })
        break
      }
      case "approval.resolved": {
        set({ approval: null })
        break
      }
      case "run.finished": {
        if (ev.run_id === state.activeRunId) {
          set({ isStreaming: false, activeRunId: null, streamBuffer: "" })
          if (ev.state === "failed" && ev.error) {
            useToastStore.getState().push("error", "Run failed", ev.error as string)
          }
        }
        break
      }
      case "session.updated": {
        // Refresh session list.
        const wsId = ev.workspace_id as string
        if (wsId) get().loadSessions(wsId)
        break
      }
    }
  },
}))

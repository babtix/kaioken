import { create } from "zustand"
import type { ConnStatus } from "@/lib/types"

type ConnState = {
  status: ConnStatus
  setStatus: (s: ConnStatus) => void
}

export const useConnStore = create<ConnState>((set) => ({
  status: "connecting",
  setStatus: (status) => set({ status }),
}))

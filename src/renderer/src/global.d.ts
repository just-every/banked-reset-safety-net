import type { ResetNetBridge } from '../../shared/ipc'

declare global {
  interface Window {
    resetNet: ResetNetBridge
  }
}

export {}

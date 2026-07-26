import { useEffect, useState } from 'react'
import type { UpdateViewState } from '../../../shared/types'

export function useUpdateState(): UpdateViewState | null {
  const [state, setState] = useState<UpdateViewState | null>(null)

  useEffect(() => {
    let active = true
    void window.resetNet
      .getUpdateState()
      .then((nextState) => {
        if (active) setState(nextState)
      })
      .catch((reason: unknown) => {
        if (!active) return
        setState({
          status: 'error',
          currentVersion: 'Unavailable',
          availableVersion: null,
          downloadPercent: null,
          checkedAt: Date.now(),
          message: `Update status could not be loaded: ${errorMessage(reason)}`
        })
      })
    const unsubscribe = window.resetNet.onUpdateStateChanged((nextState) => {
      if (active) setState(nextState)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return state
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

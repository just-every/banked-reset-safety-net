import { useCallback, useEffect, useState } from 'react'
import type { AppViewState } from '../../../shared/types'

export interface AppStateController {
  state: AppViewState | null
  error: string | null
  clearError(): void
  run(action: () => Promise<void>): Promise<void>
}

export function useAppState(): AppStateController {
  const [state, setState] = useState<AppViewState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.resetNet
      .getState()
      .then((nextState) => {
        if (active) setState(nextState)
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason))
      })

    const unsubscribe = window.resetNet.onStateChanged((nextState) => {
      if (active) setState(nextState)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }, [])

  return {
    state,
    error,
    clearError: () => setError(null),
    run
  }
}

function errorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason)
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '')
}

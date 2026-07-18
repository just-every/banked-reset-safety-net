import { useEffect, useState } from 'react'
import type { UpdateViewState } from '../../../shared/types'

export function useUpdateState(): UpdateViewState | null {
  const [state, setState] = useState<UpdateViewState | null>(null)

  useEffect(() => {
    let active = true
    void window.resetNet.getUpdateState().then((nextState) => {
      if (active) setState(nextState)
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

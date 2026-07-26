import { vi, type Mock } from 'vitest'
import type { ResetNetBridge } from '../../../src/shared/ipc'
import type {
  AppViewState,
  UpdateViewState
} from '../../../src/shared/types'
import {
  makeAppViewState,
  makeUpdateViewState
} from './appViewState'

export class ResetNetBridgeSpy implements ResetNetBridge {
  readonly getState = vi.fn<ResetNetBridge['getState']>()
  readonly refresh = vi.fn<ResetNetBridge['refresh']>()
  readonly addProfile = vi.fn<ResetNetBridge['addProfile']>()
  readonly updateProfile = vi.fn<ResetNetBridge['updateProfile']>()
  readonly removeProfile = vi.fn<ResetNetBridge['removeProfile']>()
  readonly updateSettings = vi.fn<ResetNetBridge['updateSettings']>()
  readonly chooseCodexHome = vi.fn<ResetNetBridge['chooseCodexHome']>()
  readonly chooseCodexExecutable = vi.fn<ResetNetBridge['chooseCodexExecutable']>()
  readonly discoverCodexHomes = vi.fn<ResetNetBridge['discoverCodexHomes']>()
  readonly prepareManualUse = vi.fn<ResetNetBridge['prepareManualUse']>()
  readonly acknowledgeManualUse = vi.fn<ResetNetBridge['acknowledgeManualUse']>()
  readonly confirmManualUse = vi.fn<ResetNetBridge['confirmManualUse']>()
  readonly cancelManualUse = vi.fn<ResetNetBridge['cancelManualUse']>()
  readonly getUpdateState = vi.fn<ResetNetBridge['getUpdateState']>()
  readonly checkForUpdates = vi.fn<ResetNetBridge['checkForUpdates']>()
  readonly installUpdate = vi.fn<ResetNetBridge['installUpdate']>()
  readonly quit = vi.fn<ResetNetBridge['quit']>()
  readonly unsubscribeState: Mock<() => void> = vi.fn()
  readonly unsubscribeUpdateState: Mock<() => void> = vi.fn()

  private stateListener: ((state: AppViewState) => void) | null = null
  private updateStateListener: ((state: UpdateViewState) => void) | null = null

  readonly onStateChanged = vi.fn<ResetNetBridge['onStateChanged']>((listener) => {
    this.stateListener = listener
    return () => {
      this.stateListener = null
      this.unsubscribeState()
    }
  })

  readonly onUpdateStateChanged = vi.fn<ResetNetBridge['onUpdateStateChanged']>((listener) => {
    this.updateStateListener = listener
    return () => {
      this.updateStateListener = null
      this.unsubscribeUpdateState()
    }
  })

  constructor(
    state: AppViewState = makeAppViewState(),
    updateState: UpdateViewState = makeUpdateViewState()
  ) {
    this.getState.mockResolvedValue(state)
    this.getUpdateState.mockResolvedValue(updateState)
    this.refresh.mockResolvedValue()
    this.addProfile.mockResolvedValue()
    this.updateProfile.mockResolvedValue()
    this.removeProfile.mockResolvedValue()
    this.updateSettings.mockResolvedValue()
    this.chooseCodexHome.mockResolvedValue(null)
    this.chooseCodexExecutable.mockResolvedValue(null)
    this.discoverCodexHomes.mockResolvedValue(0)
    this.cancelManualUse.mockResolvedValue()
    this.checkForUpdates.mockResolvedValue()
    this.installUpdate.mockResolvedValue()
    this.quit.mockResolvedValue()
  }

  emitState(state: AppViewState): void {
    this.stateListener?.(state)
  }

  emitUpdateState(state: UpdateViewState): void {
    this.updateStateListener?.(state)
  }
}

export function installResetNetBridge(
  state: AppViewState = makeAppViewState(),
  updateState: UpdateViewState = makeUpdateViewState()
): ResetNetBridgeSpy {
  const bridge = new ResetNetBridgeSpy(state, updateState)
  Object.defineProperty(window, 'resetNet', {
    configurable: true,
    value: bridge
  })
  return bridge
}

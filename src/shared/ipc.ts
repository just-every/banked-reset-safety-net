import type {
  AddProfileInput,
  AppViewState,
  ManualUseResult,
  ManualUseReview,
  ManualUseTypedChallenge,
  UpdateAppSettingsInput,
  UpdateProfileInput,
  UpdateViewState
} from './types'

export const IPC_CHANNELS = {
  getState: 'reset-net:get-state',
  stateChanged: 'reset-net:state-changed',
  refresh: 'reset-net:refresh',
  addProfile: 'reset-net:add-profile',
  updateProfile: 'reset-net:update-profile',
  removeProfile: 'reset-net:remove-profile',
  updateSettings: 'reset-net:update-settings',
  chooseCodexHome: 'reset-net:choose-codex-home',
  chooseCodexExecutable: 'reset-net:choose-codex-executable',
  discoverCodexHomes: 'reset-net:discover-codex-homes',
  prepareManualUse: 'reset-net:prepare-manual-use',
  acknowledgeManualUse: 'reset-net:acknowledge-manual-use',
  confirmManualUse: 'reset-net:confirm-manual-use',
  cancelManualUse: 'reset-net:cancel-manual-use',
  getUpdateState: 'reset-net:get-update-state',
  updateStateChanged: 'reset-net:update-state-changed',
  checkForUpdates: 'reset-net:check-for-updates',
  installUpdate: 'reset-net:install-update',
  quit: 'reset-net:quit'
} as const

export interface ResetNetBridge {
  getState(): Promise<AppViewState>
  refresh(): Promise<void>
  addProfile(input: AddProfileInput): Promise<void>
  updateProfile(profileId: string, input: UpdateProfileInput): Promise<void>
  removeProfile(profileId: string): Promise<void>
  updateSettings(input: UpdateAppSettingsInput): Promise<void>
  chooseCodexHome(): Promise<string | null>
  chooseCodexExecutable(): Promise<string | null>
  discoverCodexHomes(): Promise<number>
  prepareManualUse(profileId: string, creditId: string): Promise<ManualUseReview>
  acknowledgeManualUse(challengeId: string): Promise<ManualUseTypedChallenge>
  confirmManualUse(challengeId: string, exactResponse: string): Promise<ManualUseResult>
  cancelManualUse(challengeId: string): Promise<void>
  getUpdateState(): Promise<UpdateViewState>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
  quit(): Promise<void>
  onStateChanged(listener: (state: AppViewState) => void): () => void
  onUpdateStateChanged(listener: (state: UpdateViewState) => void): () => void
}

import type {
  AddProfileInput,
  AppViewState,
  UpdateAppSettingsInput,
  UpdateProfileInput
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
  quit(): Promise<void>
  onStateChanged(listener: (state: AppViewState) => void): () => void
}

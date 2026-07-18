export const SETTINGS_VERSION = 3
export const DEFAULT_LEAD_TIME_MINUTES = 30
export const MIN_LEAD_TIME_MINUTES = 1
export const MAX_LEAD_TIME_MINUTES = 60

export interface ProfileSettings {
  id: string
  name: string
  codexHome: string
  enabled: boolean
  autoRedeemEnabled: boolean
  leadTimeMinutes: number
}

export interface AppSettings {
  version: typeof SETTINGS_VERSION
  codexExecutable: string
  launchAtLogin: boolean
  ignoredCodexHomes: string[]
  profiles: ProfileSettings[]
}

export type UpdateStatus =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateViewState {
  status: UpdateStatus
  currentVersion: string
  availableVersion: string | null
  downloadPercent: number | null
  checkedAt: number | null
  message: string
}

export type ResetCreditType = 'codexRateLimits' | 'unknown'
export type ResetCreditStatus = 'available' | 'redeeming' | 'redeemed' | 'unknown'

export interface ResetCredit {
  id: string
  resetType: ResetCreditType
  status: ResetCreditStatus
  grantedAt: number
  expiresAt: number | null
  title: string | null
  description: string | null
}

export interface UsageWindow {
  usedPercent: number
  windowDurationMinutes: number | null
  resetsAt: number | null
}

export interface UsageLimit {
  id: string
  name: string | null
  primary: UsageWindow | null
  secondary: UsageWindow | null
  planType: string | null
  rateLimitReachedType: string | null
}

export type ProfileLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProfileRuntimeState {
  profileId: string
  status: ProfileLoadStatus
  usageLimits: UsageLimit[]
  availableCount: number
  credits: ResetCredit[]
  refreshedAt: number | null
  error: string | null
}

export type AutomationEventLevel = 'info' | 'success' | 'warning' | 'error'

export interface AutomationEvent {
  id: string
  profileId: string
  creditId: string | null
  timestamp: number
  level: AutomationEventLevel
  message: string
}

export interface AppViewState {
  settings: AppSettings
  profiles: ProfileRuntimeState[]
  events: AutomationEvent[]
  resolvedCodexExecutable: string | null
  updatedAt: number
}

export interface AddProfileInput {
  name: string
  codexHome: string
}

export interface UpdateProfileInput {
  name?: string
  codexHome?: string
  enabled?: boolean
  autoRedeemEnabled?: boolean
  autoRedeemConfirmed?: boolean
  leadTimeMinutes?: number
}

export interface UpdateAppSettingsInput {
  codexExecutable?: string
  launchAtLogin?: boolean
}

export type ConsumeResetOutcome = 'reset' | 'nothingToReset' | 'noCredit' | 'alreadyRedeemed'

import type {
  AppViewState,
  ProfileRuntimeState,
  ProfileSettings,
  ResetCredit,
  UpdateViewState,
  UsageLimit
} from '../../../src/shared/types'
import { SETTINGS_VERSION } from '../../../src/shared/types'

export function makeProfileSettings(
  overrides: Partial<ProfileSettings> = {}
): ProfileSettings {
  return {
    id: 'profile-primary',
    name: 'Primary',
    codexHome: '/Users/test/.codex',
    enabled: true,
    autoRedeemEnabled: false,
    leadTimeMinutes: 30,
    ...overrides
  }
}

export function makeUsageLimit(overrides: Partial<UsageLimit> = {}): UsageLimit {
  const nowSeconds = Math.floor(Date.now() / 1_000)
  return {
    id: 'codex',
    name: 'Codex',
    primary: {
      usedPercent: 40,
      windowDurationMinutes: 300,
      resetsAt: nowSeconds + 60 * 60
    },
    secondary: null,
    planType: 'pro',
    rateLimitReachedType: null,
    ...overrides
  }
}

export function makeResetCredit(overrides: Partial<ResetCredit> = {}): ResetCredit {
  const nowSeconds = Math.floor(Date.now() / 1_000)
  return {
    id: 'credit-primary',
    resetType: 'codexRateLimits',
    status: 'available',
    grantedAt: nowSeconds - 60 * 60,
    expiresAt: nowSeconds + 24 * 60 * 60,
    title: 'Banked reset',
    description: null,
    ...overrides
  }
}

export function makeProfileRuntimeState(
  overrides: Partial<ProfileRuntimeState> = {}
): ProfileRuntimeState {
  return {
    profileId: 'profile-primary',
    status: 'ready',
    usageLimits: [makeUsageLimit()],
    availableCount: 0,
    credits: [],
    refreshedAt: Date.now(),
    error: null,
    ...overrides
  }
}

export function makeAppViewState(overrides: Partial<AppViewState> = {}): AppViewState {
  const profile = makeProfileSettings()
  return {
    settings: {
      version: SETTINGS_VERSION,
      codexExecutable: '',
      launchAtLogin: false,
      expiryWarningsEnabled: true,
      ignoredCodexHomes: [],
      profiles: [profile]
    },
    expiryWarnings: {
      status: 'active',
      message: 'Expiry warnings are active.'
    },
    profiles: [makeProfileRuntimeState({ profileId: profile.id })],
    events: [],
    resetHistory: [],
    resolvedCodexExecutable: '/usr/local/bin/codex',
    updatedAt: Date.now(),
    ...overrides
  }
}

export function makeUpdateViewState(
  overrides: Partial<UpdateViewState> = {}
): UpdateViewState {
  return {
    status: 'current',
    currentVersion: '1.0.0',
    availableVersion: null,
    downloadPercent: null,
    checkedAt: Date.now(),
    message: 'Banked Reset Safety Net is up to date.',
    ...overrides
  }
}

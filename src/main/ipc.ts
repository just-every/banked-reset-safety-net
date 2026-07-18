import { app, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type {
  AddProfileInput,
  UpdateAppSettingsInput,
  UpdateProfileInput
} from '../shared/types'
import type { ResetController } from './resetController'
import type { UpdateManager } from './update/updateManager'

export function registerIpcHandlers(
  controller: ResetController,
  updateManager: UpdateManager,
  installUpdate: () => Promise<void>
): () => void {
  ipcMain.handle(IPC_CHANNELS.getState, () => controller.getState())
  ipcMain.handle(IPC_CHANNELS.refresh, () => controller.refresh())
  ipcMain.handle(IPC_CHANNELS.addProfile, (_event, value: unknown) =>
    controller.addProfile(parseAddProfileInput(value))
  )
  ipcMain.handle(
    IPC_CHANNELS.updateProfile,
    (_event, profileId: unknown, value: unknown) =>
      controller.updateProfile(requireString(profileId, 'profileId'), parseUpdateProfileInput(value))
  )
  ipcMain.handle(IPC_CHANNELS.removeProfile, (_event, profileId: unknown) =>
    controller.removeProfile(requireString(profileId, 'profileId'))
  )
  ipcMain.handle(IPC_CHANNELS.updateSettings, (_event, value: unknown) =>
    controller.updateAppSettings(parseUpdateAppSettingsInput(value))
  )
  ipcMain.handle(IPC_CHANNELS.chooseCodexHome, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a Codex home',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC_CHANNELS.chooseCodexExecutable, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose the Codex CLI executable',
      properties: ['openFile']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(IPC_CHANNELS.discoverCodexHomes, () => controller.discoverCodexHomes())
  ipcMain.handle(IPC_CHANNELS.getUpdateState, () => updateManager.getState())
  ipcMain.handle(IPC_CHANNELS.checkForUpdates, () => updateManager.check())
  ipcMain.handle(IPC_CHANNELS.installUpdate, installUpdate)
  ipcMain.handle(IPC_CHANNELS.quit, () => app.quit())

  return () => {
    for (const channel of Object.values(IPC_CHANNELS)) {
      if (channel !== IPC_CHANNELS.stateChanged && channel !== IPC_CHANNELS.updateStateChanged) {
        ipcMain.removeHandler(channel)
      }
    }
  }
}

function parseAddProfileInput(value: unknown): AddProfileInput {
  const input = requireRecord(value, 'profile')
  return {
    name: requireString(input.name, 'profile.name'),
    codexHome: requireString(input.codexHome, 'profile.codexHome')
  }
}

function parseUpdateProfileInput(value: unknown): UpdateProfileInput {
  const input = requireRecord(value, 'profile update')
  const parsed: UpdateProfileInput = {}

  if (input.name !== undefined) parsed.name = requireString(input.name, 'profile.name')
  if (input.codexHome !== undefined) {
    parsed.codexHome = requireString(input.codexHome, 'profile.codexHome')
  }
  if (input.enabled !== undefined) parsed.enabled = requireBoolean(input.enabled, 'profile.enabled')
  if (input.autoRedeemEnabled !== undefined) {
    parsed.autoRedeemEnabled = requireBoolean(
      input.autoRedeemEnabled,
      'profile.autoRedeemEnabled'
    )
  }
  if (input.autoRedeemConfirmed !== undefined) {
    parsed.autoRedeemConfirmed = requireBoolean(
      input.autoRedeemConfirmed,
      'profile.autoRedeemConfirmed'
    )
  }
  if (input.leadTimeMinutes !== undefined) {
    parsed.leadTimeMinutes = requireNumber(input.leadTimeMinutes, 'profile.leadTimeMinutes')
  }
  return parsed
}

function parseUpdateAppSettingsInput(value: unknown): UpdateAppSettingsInput {
  const input = requireRecord(value, 'settings update')
  const parsed: UpdateAppSettingsInput = {}
  if (input.codexExecutable !== undefined) {
    parsed.codexExecutable = requireString(input.codexExecutable, 'codexExecutable')
  }
  if (input.launchAtLogin !== undefined) {
    parsed.launchAtLogin = requireBoolean(input.launchAtLogin, 'launchAtLogin')
  }
  return parsed
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`)
  return value
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`)
  return value
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== 'number') throw new Error(`${label} must be a number.`)
  return value
}

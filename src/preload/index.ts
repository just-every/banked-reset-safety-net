import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ResetNetBridge } from '../shared/ipc'
import type { AppViewState, UpdateViewState } from '../shared/types'

const bridge: ResetNetBridge = {
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.getState) as Promise<AppViewState>,
  refresh: () => ipcRenderer.invoke(IPC_CHANNELS.refresh) as Promise<void>,
  addProfile: (input) => ipcRenderer.invoke(IPC_CHANNELS.addProfile, input) as Promise<void>,
  updateProfile: (profileId, input) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateProfile, profileId, input) as Promise<void>,
  removeProfile: (profileId) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeProfile, profileId) as Promise<void>,
  updateSettings: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSettings, input) as Promise<void>,
  chooseCodexHome: () =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseCodexHome) as Promise<string | null>,
  chooseCodexExecutable: () =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseCodexExecutable) as Promise<string | null>,
  discoverCodexHomes: () =>
    ipcRenderer.invoke(IPC_CHANNELS.discoverCodexHomes) as Promise<number>,
  getUpdateState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getUpdateState) as Promise<UpdateViewState>,
  checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates) as Promise<void>,
  installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.installUpdate) as Promise<void>,
  quit: () => ipcRenderer.invoke(IPC_CHANNELS.quit) as Promise<void>,
  onStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppViewState): void => listener(state)
    ipcRenderer.on(IPC_CHANNELS.stateChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, handler)
  },
  onUpdateStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateViewState): void =>
      listener(state)
    ipcRenderer.on(IPC_CHANNELS.updateStateChanged, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.updateStateChanged, handler)
  }
}

contextBridge.exposeInMainWorld('resetNet', bridge)

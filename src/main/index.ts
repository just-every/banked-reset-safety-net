import path from 'node:path'
import { app, dialog, Notification } from 'electron'
import updaterPackage from 'electron-updater'
import { IPC_CHANNELS } from '../shared/ipc'
import { AutomationLedger } from './automation/automationLedger'
import { RedemptionLock } from './automation/redemptionLock'
import { registerIpcHandlers } from './ipc'
import { ResetController } from './resetController'
import { SettingsStore } from './settings/settingsStore'
import { TrayController } from './ui/trayController'
import { TrayWindow } from './ui/trayWindow'
import { installedUpdater, UpdateManager } from './update/updateManager'

app.setName('Reset Net')
app.setAppUserModelId('net.bankedreset.app')

const { autoUpdater } = updaterPackage

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else void startApplication()

async function startApplication(): Promise<void> {
  await app.whenReady()
  if (process.platform === 'darwin') app.dock?.hide()

  const userData = app.getPath('userData')
  const settings = new SettingsStore(path.join(userData, 'settings.json'))
  const ledger = new AutomationLedger(path.join(userData, 'automation-ledger.json'))
  const redemptionLock = new RedemptionLock(
    path.join(app.getPath('appData'), 'Reset Net', 'redemption-locks')
  )
  const controller = new ResetController({
    settings,
    ledger,
    redemptionLock,
    notify: ({ title, body }) => {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    },
    setLaunchAtLogin: (enabled) => {
      if (app.isPackaged && (process.platform === 'darwin' || process.platform === 'win32')) {
        app.setLoginItemSettings({ openAtLogin: enabled })
      }
    }
  })
  const updateManager = new UpdateManager({
    updater: installedUpdater(app.isPackaged, process.platform, autoUpdater),
    currentVersion: app.getVersion(),
    notifyReady: (version) => {
      if (Notification.isSupported()) {
        new Notification({
          title: 'Reset Net update ready',
          body: `Version ${version} will install when you restart Reset Net.`
        }).show()
      }
    }
  })

  try {
    await controller.initialize()
  } catch (error) {
    dialog.showErrorBox('Reset Net could not start', errorMessage(error))
    app.quit()
    return
  }

  const trayWindow = new TrayWindow()
  const trayController = new TrayController(
    trayWindow,
    () => void controller.refresh().catch((error) => console.error(error)),
    () => app.quit()
  )
  let shutdownPromise: Promise<void> | null = null
  let shutdownComplete = false
  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise
    trayWindow.prepareToQuit()
    unsubscribe()
    unsubscribeUpdates()
    unregisterIpc()
    trayController.destroy()
    updateManager.shutdown()
    shutdownPromise = controller.shutdown()
    return shutdownPromise
  }
  const installUpdate = async (): Promise<void> => {
    await shutdown()
    shutdownComplete = true
    updateManager.quitAndInstall()
  }
  const unregisterIpc = registerIpcHandlers(controller, updateManager, installUpdate)
  const unsubscribe = controller.subscribe((state) => {
    trayController.update(state)
    if (!trayWindow.browserWindow.isDestroyed()) {
      trayWindow.browserWindow.webContents.send(IPC_CHANNELS.stateChanged, state)
    }
  })
  const unsubscribeUpdates = updateManager.subscribe((state) => {
    if (!trayWindow.browserWindow.isDestroyed()) {
      trayWindow.browserWindow.webContents.send(IPC_CHANNELS.updateStateChanged, state)
    }
  })

  trayController.update(controller.getState())
  updateManager.initialize()

  app.on('second-instance', () => trayWindow.show(trayController.tray))
  app.on('activate', () => trayWindow.show(trayController.tray))
  app.on('before-quit', (event) => {
    if (shutdownComplete) return
    event.preventDefault()
    void shutdown().finally(() => {
      shutdownComplete = true
      app.quit()
    })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

import path from 'node:path'
import { app, dialog, Notification } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import { AutomationLedger } from './automation/automationLedger'
import { RedemptionLock } from './automation/redemptionLock'
import { registerIpcHandlers } from './ipc'
import { ResetController } from './resetController'
import { SettingsStore } from './settings/settingsStore'
import { TrayController } from './ui/trayController'
import { TrayWindow } from './ui/trayWindow'

app.setName('Reset Net')
app.setAppUserModelId('net.bankedreset.app')

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
  const unregisterIpc = registerIpcHandlers(controller)
  const unsubscribe = controller.subscribe((state) => {
    trayController.update(state)
    if (!trayWindow.browserWindow.isDestroyed()) {
      trayWindow.browserWindow.webContents.send(IPC_CHANNELS.stateChanged, state)
    }
  })

  trayController.update(controller.getState())

  app.on('second-instance', () => trayWindow.show(trayController.tray))
  app.on('activate', () => trayWindow.show(trayController.tray))
  let shutdownStarted = false
  let shutdownComplete = false
  app.on('before-quit', (event) => {
    if (shutdownComplete) return
    event.preventDefault()
    if (shutdownStarted) return
    shutdownStarted = true
    trayWindow.prepareToQuit()
    unsubscribe()
    unregisterIpc()
    trayController.destroy()
    void controller.shutdown().finally(() => {
      shutdownComplete = true
      app.quit()
    })
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

import path from 'node:path'
import { BrowserWindow, screen, type Rectangle, type Tray } from 'electron'
import { getTrayClickAction } from './trayInteraction'

const WINDOW_WIDTH = 420
const WINDOW_HEIGHT = 700

export class TrayWindow {
  readonly browserWindow: BrowserWindow
  private quitting = false

  constructor() {
    this.browserWindow = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      backgroundColor: '#11131a',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })

    this.browserWindow.on('close', (event) => {
      if (this.quitting) return
      event.preventDefault()
      this.browserWindow.hide()
    })
    this.browserWindow.on('blur', () => {
      if (!this.browserWindow.webContents.isDevToolsOpened()) this.browserWindow.hide()
    })

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    if (rendererUrl) void this.browserWindow.loadURL(rendererUrl)
    else void this.browserWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  toggle(tray: Tray): void {
    const action = getTrayClickAction(
      this.browserWindow.isVisible(),
      this.browserWindow.isFocused()
    )
    if (action === 'hide') {
      this.browserWindow.hide()
      return
    }
    this.show(tray)
  }

  show(tray: Tray): void {
    const bounds = positionWindow(tray.getBounds())
    this.browserWindow.setPosition(bounds.x, bounds.y, false)
    this.browserWindow.show()
    this.browserWindow.focus()
  }

  prepareToQuit(): void {
    this.quitting = true
  }
}

function positionWindow(trayBounds: Rectangle): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2)
  })
  const workArea = display.workArea

  const desiredX = Math.round(trayBounds.x + trayBounds.width / 2 - WINDOW_WIDTH / 2)
  const x = clamp(desiredX, workArea.x + 8, workArea.x + workArea.width - WINDOW_WIDTH - 8)
  const y =
    process.platform === 'darwin'
      ? Math.round(trayBounds.y + trayBounds.height + 6)
      : Math.round(workArea.y + workArea.height - WINDOW_HEIGHT - 8)

  return { x, y }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

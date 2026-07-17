import { Menu, Tray } from 'electron'
import { findNextExpiringCredit, formatTrayCountdown } from '../../shared/time'
import type { AppViewState } from '../../shared/types'
import { createTrayIcon } from './trayIcon'
import type { TrayWindow } from './trayWindow'

export class TrayController {
  readonly tray: Tray
  private state: AppViewState | null = null
  private readonly countdownTimer: NodeJS.Timeout

  constructor(
    private readonly window: TrayWindow,
    refresh: () => void,
    quit: () => void
  ) {
    this.tray = new Tray(createTrayIcon())
    this.tray.setToolTip('Reset Net')
    if (process.platform === 'darwin') this.tray.setIgnoreDoubleClickEvents(true)
    this.tray.on('click', () => this.window.toggle(this.tray))
    this.tray.on('right-click', () => {
      const menu = Menu.buildFromTemplate([
        { label: 'Show Reset Net', click: () => this.window.show(this.tray) },
        { label: 'Refresh now', click: refresh },
        { type: 'separator' },
        { label: 'Quit Reset Net', click: quit }
      ])
      this.tray.popUpContextMenu(menu)
    })
    this.countdownTimer = setInterval(() => this.updateCountdown(), 10_000)
  }

  update(state: AppViewState): void {
    this.state = state
    this.updateCountdown()
  }

  destroy(): void {
    clearInterval(this.countdownTimer)
    this.tray.destroy()
  }

  private updateCountdown(): void {
    const next = this.state ? findNextExpiringCredit(this.state.profiles) : null
    if (!next?.credit.expiresAt) {
      if (process.platform === 'darwin') this.tray.setTitle('')
      this.tray.setToolTip('Reset Net — no expiring reset found')
      return
    }

    const countdown = formatTrayCountdown(next.credit.expiresAt)
    if (process.platform === 'darwin') this.tray.setTitle(countdown ? ` ${countdown}` : '')
    const profile = this.state?.settings.profiles.find(
      (candidate) => candidate.id === next.profileId
    )
    this.tray.setToolTip(`Reset Net — ${profile?.name ?? 'Codex'} expires in ${countdown}`)
  }
}

import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { APP_NAME } from '../../shared/branding'

export const LINUX_AUTOSTART_FILENAME = 'net.bankedreset.app.desktop'

export interface LinuxAutostartOptions {
  configDirectory: string
  appImagePath: string
}

export async function setLinuxAutostart(
  enabled: boolean,
  options: LinuxAutostartOptions
): Promise<void> {
  const autostartDirectory = path.join(options.configDirectory, 'autostart')
  const desktopEntryPath = path.join(autostartDirectory, LINUX_AUTOSTART_FILENAME)

  if (!enabled) {
    await rm(desktopEntryPath, { force: true })
    return
  }

  const appImagePath = options.appImagePath.trim()
  if (!path.isAbsolute(appImagePath)) {
    throw new Error('Linux launch at login requires an absolute AppImage path.')
  }

  await mkdir(autostartDirectory, { recursive: true })
  const temporaryPath = path.join(
    autostartDirectory,
    `.${LINUX_AUTOSTART_FILENAME}.${randomUUID()}.tmp`
  )
  try {
    await writeFile(temporaryPath, desktopEntry(appImagePath), {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    })
    await rename(temporaryPath, desktopEntryPath)
    await chmod(desktopEntryPath, 0o600)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

function desktopEntry(appImagePath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=${APP_NAME}`,
    'Comment=Track Codex usage windows and banked resets before expiry',
    `Exec=${quoteDesktopExecArgument(appImagePath)}`,
    'Terminal=false',
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

export function quoteDesktopExecArgument(value: string): string {
  if (/[\r\n\0]/u.test(value)) {
    throw new Error('Linux AppImage path contains an invalid control character.')
  }
  const escaped = value
    .replaceAll('%', '%%')
    .replace(/([\\`"$])/gu, '\\$1')
  return `"${escaped}"`
}

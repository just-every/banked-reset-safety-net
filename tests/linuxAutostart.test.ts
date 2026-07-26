import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LINUX_AUTOSTART_FILENAME,
  quoteDesktopExecArgument,
  setLinuxAutostart
} from '../src/main/startup/linuxAutostart'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })
    )
  )
})

describe('Linux autostart', () => {
  it('atomically writes a private XDG autostart entry for the exact AppImage path', async () => {
    const configDirectory = await temporaryDirectory()
    const appImagePath = '/opt/Banked Reset $afety 100%.AppImage'

    await setLinuxAutostart(true, { configDirectory, appImagePath })

    const desktopEntryPath = path.join(
      configDirectory,
      'autostart',
      LINUX_AUTOSTART_FILENAME
    )
    const content = await readFile(desktopEntryPath, 'utf8')
    expect(content).toContain('Name=Banked Reset Safety Net')
    expect(content).toContain(
      'Exec="/opt/Banked Reset \\$afety 100%%.AppImage"'
    )
    expect(content).toContain('X-GNOME-Autostart-enabled=true')
    expect((await stat(desktopEntryPath)).mode & 0o777).toBe(0o600)
    expect(await readdir(path.join(configDirectory, 'autostart'))).toEqual([
      LINUX_AUTOSTART_FILENAME
    ])
  })

  it('removes only the application autostart entry when disabled', async () => {
    const configDirectory = await temporaryDirectory()
    const autostartDirectory = path.join(configDirectory, 'autostart')
    const unrelatedEntry = path.join(autostartDirectory, 'other.desktop')
    await mkdir(autostartDirectory, { recursive: true })
    await writeFile(unrelatedEntry, 'keep', 'utf8')
    await setLinuxAutostart(true, {
      configDirectory,
      appImagePath: '/opt/Banked Reset Safety Net.AppImage'
    })

    await setLinuxAutostart(false, {
      configDirectory,
      appImagePath: ''
    })

    await expect(
      stat(path.join(autostartDirectory, LINUX_AUTOSTART_FILENAME))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(unrelatedEntry, 'utf8')).toBe('keep')
  })

  it('rejects relative and control-character paths without writing an entry', async () => {
    const configDirectory = await temporaryDirectory()

    await expect(
      setLinuxAutostart(true, { configDirectory, appImagePath: 'relative.AppImage' })
    ).rejects.toThrow('absolute AppImage path')
    expect(() => quoteDesktopExecArgument('/opt/unsafe\npath.AppImage')).toThrow(
      'control character'
    )
  })

  it('surfaces an unwritable configuration layout', async () => {
    const configDirectory = await temporaryDirectory()
    await writeFile(path.join(configDirectory, 'autostart'), 'not a directory', 'utf8')

    await expect(
      setLinuxAutostart(true, {
        configDirectory,
        appImagePath: '/opt/Banked Reset Safety Net.AppImage'
      })
    ).rejects.toBeDefined()
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'banked-reset-autostart-'))
  temporaryDirectories.push(directory)
  return directory
}

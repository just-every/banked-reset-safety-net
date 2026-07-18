import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  NativeCodexPackageMissingError,
  resolveNativeCodexCandidate
} from './nativeCodexResolver'

export async function resolveCodexExecutable(configuredPath: string): Promise<string> {
  if (configuredPath.trim()) {
    const configured = path.resolve(configuredPath)
    if (!(await isExecutable(configured))) {
      throw new Error(`Configured Codex executable is unavailable: ${configuredPath}`)
    }
    const executable = await resolveNativeCodexCandidate(configured)
    if (executable) return executable
    throw new Error(
      `Configured Codex executable is a script without a resolvable native Codex binary: ${configuredPath}`
    )
  }

  const candidates = automaticCandidates()
  let nativePackageError: NativeCodexPackageMissingError | null = null
  for (const candidate of candidates) {
    try {
      const executable = await resolveNativeCodexCandidate(candidate)
      if (executable) return executable
    } catch (error) {
      if (error instanceof NativeCodexPackageMissingError) nativePackageError ??= error
      else throw error
    }
  }

  if (nativePackageError) throw nativePackageError

  throw new Error(
    'Could not find the Codex CLI. Set its executable path in Banked Reset Safety Net settings.'
  )
}

function automaticCandidates(): string[] {
  const executableNames = process.platform === 'win32' ? ['codex.exe', 'codex.cmd'] : ['codex']
  const pathCandidates = (process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) => executableNames.map((name) => path.join(directory, name)))

  const platformCandidates =
    process.platform === 'darwin'
      ? [
          path.join(homedir(), '.npm-global', 'bin', 'codex'),
          path.join(homedir(), '.local', 'bin', 'codex'),
          '/opt/homebrew/bin/codex',
          '/usr/local/bin/codex',
          '/Applications/ChatGPT.app/Contents/Resources/codex'
        ]
      : process.platform === 'win32'
        ? [
            ...(process.env.APPDATA
              ? [path.join(process.env.APPDATA, 'npm', 'codex.cmd')]
              : []),
            ...(process.env.LOCALAPPDATA
              ? [path.join(process.env.LOCALAPPDATA, 'Programs', 'codex', 'codex.exe')]
              : [])
          ]
        : [
            path.join(homedir(), '.npm-global', 'bin', 'codex'),
            path.join(homedir(), '.local', 'bin', 'codex'),
            '/usr/local/bin/codex',
            '/usr/bin/codex'
          ]

  return [...new Set([...platformCandidates, ...pathCandidates].filter(Boolean))]
}

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

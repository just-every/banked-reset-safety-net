import { constants } from 'node:fs'
import { access, open, realpath } from 'node:fs/promises'
import path from 'node:path'

export interface CodexRuntimeTarget {
  platform: NodeJS.Platform
  arch: string
}

interface NativePackageTarget {
  packageName: string
  targetTriple: string
  executableName: string
}

export class NativeCodexPackageMissingError extends Error {
  constructor(
    readonly packageRoot: string,
    readonly packageName: string
  ) {
    super(
      `The Codex launcher needs ${packageName}, but its native executable is missing. Reinstall the Codex CLI.`
    )
    this.name = 'NativeCodexPackageMissingError'
  }
}

/**
 * Turns an npm/pnpm Codex launcher into the native executable shipped with that
 * installation. GUI apps cannot safely execute `#!/usr/bin/env node` launchers
 * because macOS Finder and Windows Explorer do not inherit a shell's Node PATH.
 */
export async function resolveNativeCodexCandidate(
  candidate: string,
  target: CodexRuntimeTarget = { platform: process.platform, arch: process.arch }
): Promise<string | null> {
  const absoluteCandidate = path.resolve(candidate)
  if (!(await isAccessible(absoluteCandidate, target.platform))) return null

  const canonicalCandidate = await realpath(absoluteCandidate)
  const launcher = await findOfficialLauncher(absoluteCandidate, canonicalCandidate)
  if (!launcher) {
    return (await isScript(canonicalCandidate, target.platform)) ? null : canonicalCandidate
  }

  const nativeTarget = nativePackageTarget(target)
  if (!nativeTarget) {
    throw new Error(`Unsupported Codex platform: ${target.platform} (${target.arch}).`)
  }

  const packageRoot = path.dirname(path.dirname(launcher))
  for (const vendorRoot of nativeVendorRoots(packageRoot, nativeTarget.packageName)) {
    const executable = path.join(
      vendorRoot,
      nativeTarget.targetTriple,
      'bin',
      nativeTarget.executableName
    )
    if (await isAccessible(executable, target.platform)) return await realpath(executable)
  }

  throw new NativeCodexPackageMissingError(packageRoot, nativeTarget.packageName)
}

function nativePackageTarget(target: CodexRuntimeTarget): NativePackageTarget | null {
  const executableName = target.platform === 'win32' ? 'codex.exe' : 'codex'
  const key = `${target.platform}:${target.arch}`
  const values: Record<string, Omit<NativePackageTarget, 'executableName'>> = {
    'darwin:arm64': {
      packageName: '@openai/codex-darwin-arm64',
      targetTriple: 'aarch64-apple-darwin'
    },
    'darwin:x64': {
      packageName: '@openai/codex-darwin-x64',
      targetTriple: 'x86_64-apple-darwin'
    },
    'win32:arm64': {
      packageName: '@openai/codex-win32-arm64',
      targetTriple: 'aarch64-pc-windows-msvc'
    },
    'win32:x64': {
      packageName: '@openai/codex-win32-x64',
      targetTriple: 'x86_64-pc-windows-msvc'
    },
    'linux:arm64': {
      packageName: '@openai/codex-linux-arm64',
      targetTriple: 'aarch64-unknown-linux-musl'
    },
    'linux:x64': {
      packageName: '@openai/codex-linux-x64',
      targetTriple: 'x86_64-unknown-linux-musl'
    }
  }
  const value = values[key]
  return value ? { ...value, executableName } : null
}

async function findOfficialLauncher(
  absoluteCandidate: string,
  canonicalCandidate: string
): Promise<string | null> {
  if (isOfficialLauncherPath(canonicalCandidate)) return canonicalCandidate

  const launcherDirectory = path.dirname(absoluteCandidate)
  const possibleLaunchers = [
    path.join(launcherDirectory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    path.join(
      launcherDirectory,
      '..',
      'lib',
      'node_modules',
      '@openai',
      'codex',
      'bin',
      'codex.js'
    )
  ]

  for (const possibleLauncher of possibleLaunchers) {
    try {
      const canonical = await realpath(possibleLauncher)
      if (isOfficialLauncherPath(canonical)) return canonical
    } catch {
      // A candidate may be a direct native executable or use a different layout.
    }
  }
  return null
}

function isOfficialLauncherPath(candidate: string): boolean {
  const binDirectory = path.dirname(candidate)
  const packageRoot = path.dirname(binDirectory)
  const scopeDirectory = path.dirname(packageRoot)
  return (
    path.basename(candidate).toLowerCase() === 'codex.js' &&
    path.basename(binDirectory).toLowerCase() === 'bin' &&
    path.basename(packageRoot).toLowerCase() === 'codex' &&
    path.basename(scopeDirectory).toLowerCase() === '@openai'
  )
}

function nativeVendorRoots(packageRoot: string, packageName: string): string[] {
  const roots = new Set<string>([
    path.join(packageRoot, 'node_modules', packageName, 'vendor'),
    path.join(packageRoot, 'vendor')
  ])

  let current = packageRoot
  const filesystemRoot = path.parse(current).root
  while (current !== filesystemRoot) {
    if (path.basename(current).toLowerCase() === 'node_modules') {
      roots.add(path.join(current, packageName, 'vendor'))
    }
    current = path.dirname(current)
  }
  return [...roots]
}

async function isScript(candidate: string, platform: NodeJS.Platform): Promise<boolean> {
  const extension = path.extname(candidate).toLowerCase()
  if (['.js', '.cmd', '.bat', '.ps1'].includes(extension)) return true
  if (platform === 'win32') return extension !== '.exe'

  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(candidate, 'r')
    const start = Buffer.alloc(2)
    const { bytesRead } = await handle.read(start, 0, start.length, 0)
    return bytesRead === 2 && start[0] === 0x23 && start[1] === 0x21
  } catch {
    return true
  } finally {
    await handle?.close()
  }
}

async function isAccessible(candidate: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

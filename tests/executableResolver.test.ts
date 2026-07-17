import { chmod, mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  NativeCodexPackageMissingError,
  resolveNativeCodexCandidate
} from '../src/main/codex/nativeCodexResolver'

describe('native Codex executable resolution', () => {
  it('resolves an npm symlink to the packaged macOS binary', async () => {
    const prefix = await mkdtemp(path.join(tmpdir(), 'reset-net-codex-npm-'))
    const launcher = path.join(
      prefix,
      'lib',
      'node_modules',
      '@openai',
      'codex',
      'bin',
      'codex.js'
    )
    const native = path.join(
      prefix,
      'lib',
      'node_modules',
      '@openai',
      'codex',
      'node_modules',
      '@openai',
      'codex-darwin-arm64',
      'vendor',
      'aarch64-apple-darwin',
      'bin',
      'codex'
    )
    const shim = path.join(prefix, 'bin', 'codex')
    await Promise.all([
      mkdir(path.dirname(launcher), { recursive: true }),
      mkdir(path.dirname(native), { recursive: true }),
      mkdir(path.dirname(shim), { recursive: true })
    ])
    await Promise.all([
      writeFile(launcher, '#!/usr/bin/env node\n', { mode: 0o755 }),
      writeFile(native, 'native-codex', { mode: 0o755 })
    ])
    await Promise.all([chmod(launcher, 0o755), chmod(native, 0o755)])
    await symlink('../lib/node_modules/@openai/codex/bin/codex.js', shim)

    await expect(
      resolveNativeCodexCandidate(shim, { platform: 'darwin', arch: 'arm64' })
    ).resolves.toBe(await realpath(native))
  })

  it('resolves a Windows npm command shim without executing Node', async () => {
    const npmDirectory = await mkdtemp(path.join(tmpdir(), 'reset-net-codex-win-'))
    const shim = path.join(npmDirectory, 'codex.cmd')
    const packageRoot = path.join(npmDirectory, 'node_modules', '@openai', 'codex')
    const launcher = path.join(packageRoot, 'bin', 'codex.js')
    const native = path.join(
      packageRoot,
      'node_modules',
      '@openai',
      'codex-win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
      'bin',
      'codex.exe'
    )
    await Promise.all([
      mkdir(path.dirname(launcher), { recursive: true }),
      mkdir(path.dirname(native), { recursive: true })
    ])
    await Promise.all([
      writeFile(shim, '@node "%~dp0\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n'),
      writeFile(launcher, '#!/usr/bin/env node\n'),
      writeFile(native, 'native-codex.exe')
    ])

    await expect(
      resolveNativeCodexCandidate(shim, { platform: 'win32', arch: 'x64' })
    ).resolves.toBe(await realpath(native))
  })

  it('fails clearly when an official launcher has no native package', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'reset-net-codex-missing-'))
    const launcher = path.join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    await mkdir(path.dirname(launcher), { recursive: true })
    await writeFile(launcher, '#!/usr/bin/env node\n', { mode: 0o755 })
    await chmod(launcher, 0o755)

    await expect(
      resolveNativeCodexCandidate(launcher, { platform: 'darwin', arch: 'arm64' })
    ).rejects.toBeInstanceOf(NativeCodexPackageMissingError)
  })
})

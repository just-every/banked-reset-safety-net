import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCodexExecutable } from '../src/main/codex/executableResolver'
import {
  NativeCodexPackageMissingError,
  resolveNativeCodexCandidate
} from '../src/main/codex/nativeCodexResolver'

vi.mock('../src/main/codex/nativeCodexResolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/main/codex/nativeCodexResolver')>()
  return { ...actual, resolveNativeCodexCandidate: vi.fn() }
})

const bundledCodex =
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
const legacyBundledCodex = '/Applications/ChatGPT.app/Contents/Resources/codex'
const standaloneCodex = '/opt/homebrew/bin/codex'
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
const resolveCandidate = vi.mocked(resolveNativeCodexCandidate)

describe('automatic Codex executable resolution', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    vi.stubEnv('PATH', '')
    resolveCandidate.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', platformDescriptor)
    vi.unstubAllEnvs()
  })

  it('finds the new macOS bundle even when an earlier npm installation is incomplete', async () => {
    const missingPackage = new NativeCodexPackageMissingError(
      '/opt/homebrew/lib/node_modules/@openai/codex',
      '@openai/codex-darwin-arm64'
    )
    resolveCandidate.mockImplementation(async (candidate) => {
      if (candidate === standaloneCodex) throw missingPackage
      return candidate === bundledCodex ? bundledCodex : null
    })

    await expect(resolveCodexExecutable('')).resolves.toBe(bundledCodex)
  })

  it('retains support for the legacy macOS bundle location', async () => {
    resolveCandidate.mockImplementation(async (candidate) =>
      candidate === legacyBundledCodex ? legacyBundledCodex : null
    )

    await expect(resolveCodexExecutable('')).resolves.toBe(legacyBundledCodex)
  })

  it('preserves standalone CLI precedence over the bundled CLI', async () => {
    resolveCandidate.mockImplementation(async (candidate) =>
      candidate === standaloneCodex || candidate === bundledCodex ? candidate : null
    )

    await expect(resolveCodexExecutable('')).resolves.toBe(standaloneCodex)
    expect(resolveCandidate).not.toHaveBeenCalledWith(bundledCodex)
  })

  it.each(['linux', 'win32'])('does not search macOS bundles on %s', async (platform) => {
    Object.defineProperty(process, 'platform', { value: platform })
    resolveCandidate.mockImplementation(async (candidate) =>
      candidate === bundledCodex ? bundledCodex : null
    )

    await expect(resolveCodexExecutable('')).rejects.toThrow('Could not find the Codex CLI')
    expect(resolveCandidate).not.toHaveBeenCalledWith(bundledCodex)
    expect(resolveCandidate).not.toHaveBeenCalledWith(legacyBundledCodex)
  })
})

import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareReleaseAssets } from '../scripts/release/prepare-release-assets.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

describe('release asset manifest', () => {
  it('writes checksums with download-directory-safe basenames', async () => {
    const directory = await createTemporaryDirectory()
    const version = '9.8.7'
    const artifacts = artifactNames(version)

    await Promise.all(
      artifacts.map((name, index) =>
        writeFile(join(directory, name), artifactContent(name, index, version))
      )
    )
    await prepareReleaseAssets(directory, version)

    const manifest = await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')
    const lines = manifest.trimEnd().split('\n')

    expect(lines).toHaveLength(artifacts.length)
    expect(lines).toEqual(
      artifacts.map((name, index) =>
        `${sha256(artifactContent(name, index, version))}  ${basename(name)}`
      )
    )
    expect(lines.every((line) => !line.includes('  dist/'))).toBe(true)
  })

  it('fails closed when an expected artifact is missing', async () => {
    const directory = await createTemporaryDirectory()

    await expect(prepareReleaseAssets(directory, '9.8.7')).rejects.toThrow(
      'Required release asset is missing or empty'
    )
  })
})

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'reset net release assets-'))
  temporaryDirectories.push(directory)
  return directory
}

function artifactNames(version: string): string[] {
  void version
  return [
    'Reset-Net-mac-universal.dmg',
    'Reset-Net-mac-universal.zip',
    'Reset-Net-mac-universal.zip.blockmap',
    'Reset-Net-win-x64.exe',
    'Reset-Net-win-x64.exe.blockmap',
    'Reset-Net-win-arm64.exe',
    'Reset-Net-win-arm64.exe.blockmap',
    'latest-mac.yml',
    'latest.yml',
    'latest-arm64.yml'
  ]
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function artifactContent(name: string, index: number, version: string): string {
  const updateTargets: Record<string, string> = {
    'latest-mac.yml': 'Reset-Net-mac-universal.zip',
    'latest.yml': 'Reset-Net-win-x64.exe',
    'latest-arm64.yml': 'Reset-Net-win-arm64.exe'
  }
  const target = updateTargets[name]
  return target ? `version: ${version}\npath: ${target}\n` : `artifact-${index}`
}

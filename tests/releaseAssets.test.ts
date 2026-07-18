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
      artifacts.map((name, index) => writeFile(join(directory, name), `artifact-${index}`))
    )
    await prepareReleaseAssets(directory, version)

    const manifest = await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')
    const lines = manifest.trimEnd().split('\n')

    expect(lines).toHaveLength(artifacts.length)
    expect(lines).toEqual(
      artifacts.map((name, index) => `${sha256(`artifact-${index}`)}  ${basename(name)}`)
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
  return [
    `Reset-Net-${version}-mac-universal.dmg`,
    `Reset-Net-${version}-mac-universal.zip`,
    `Reset-Net-${version}-win-x64.exe`,
    `Reset-Net-${version}-win-arm64.exe`
  ]
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

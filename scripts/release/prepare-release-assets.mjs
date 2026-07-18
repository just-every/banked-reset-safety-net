import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function prepareReleaseAssets(distributionDirectory, version) {
  if (!distributionDirectory || !version) {
    throw new Error('A distribution directory and package version are required.')
  }

  const artifacts = [
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
  ].map((name) => join(distributionDirectory, name))

  await Promise.all(
    artifacts.map(async (artifact) => {
      const details = await stat(artifact).catch(() => null)
      if (!details?.isFile() || details.size === 0) {
        throw new Error(`Required release asset is missing or empty: ${artifact}`)
      }
    })
  )
  await Promise.all([
    validateUpdateMetadata(
      join(distributionDirectory, 'latest-mac.yml'),
      version,
      'Reset-Net-mac-universal.zip'
    ),
    validateUpdateMetadata(
      join(distributionDirectory, 'latest.yml'),
      version,
      'Reset-Net-win-x64.exe'
    ),
    validateUpdateMetadata(
      join(distributionDirectory, 'latest-arm64.yml'),
      version,
      'Reset-Net-win-arm64.exe'
    )
  ])

  const hashes = await Promise.all(artifacts.map(hashFile))
  const manifest = artifacts
    .map((artifact, index) => `${hashes[index]}  ${basename(artifact)}`)
    .join('\n')

  await writeFile(join(distributionDirectory, 'SHA256SUMS.txt'), `${manifest}\n`, 'utf8')
}

async function validateUpdateMetadata(file, version, artifactName) {
  const content = await readFile(file, 'utf8')
  if (!content.includes(`version: ${version}`) || !content.includes(artifactName)) {
    throw new Error(`Update metadata does not target version ${version} and ${artifactName}: ${file}`)
  }
}

async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  prepareReleaseAssets(process.argv[2], process.argv[3]).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

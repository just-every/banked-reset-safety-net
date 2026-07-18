import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function prepareReleaseAssets(distributionDirectory, version) {
  if (!distributionDirectory || !version) {
    throw new Error('A distribution directory and package version are required.')
  }

  const artifacts = [
    `Reset-Net-${version}-mac-universal.dmg`,
    `Reset-Net-${version}-mac-universal.zip`,
    `Reset-Net-${version}-win-x64.exe`,
    `Reset-Net-${version}-win-arm64.exe`
  ].map((name) => join(distributionDirectory, name))

  await Promise.all(
    artifacts.map(async (artifact) => {
      const details = await stat(artifact).catch(() => null)
      if (!details?.isFile() || details.size === 0) {
        throw new Error(`Required release asset is missing or empty: ${artifact}`)
      }
    })
  )

  const hashes = await Promise.all(artifacts.map(hashFile))
  const manifest = artifacts
    .map((artifact, index) => `${hashes[index]}  ${basename(artifact)}`)
    .join('\n')

  await writeFile(join(distributionDirectory, 'SHA256SUMS.txt'), `${manifest}\n`, 'utf8')
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

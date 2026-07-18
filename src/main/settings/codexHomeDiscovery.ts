import { readdir } from 'node:fs/promises'
import path from 'node:path'

const CODEX_HOME_NAME = /^\.codex(?:[_-].+)?$/i

export async function discoverCodexHomes(rootDirectory: string): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && CODEX_HOME_NAME.test(entry.name))
    .map((entry) => path.join(rootDirectory, entry.name))
    .sort((left, right) => codexHomeOrder(path.basename(left), path.basename(right)))
}

export function codexHomeDisplayName(codexHome: string): string {
  const directoryName = path.basename(codexHome)
  if (directoryName.toLocaleLowerCase('en-US') === '.codex') return 'Default Codex'

  const suffix = directoryName.replace(/^\.codex[_-]?/i, '')
  const words = suffix
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toLocaleUpperCase('en-US')}${word.slice(1)}`)
  return words.length > 0 ? `Codex ${words.join(' ')}` : 'Codex'
}

function codexHomeOrder(left: string, right: string): number {
  if (left === '.codex') return -1
  if (right === '.codex') return 1
  return left.localeCompare(right)
}

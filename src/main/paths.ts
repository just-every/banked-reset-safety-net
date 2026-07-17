import { homedir } from 'node:os'
import path from 'node:path'

export function expandHome(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith(`~${path.sep}`) || trimmed.startsWith('~/')) {
    return path.join(homedir(), trimmed.slice(2))
  }
  return trimmed
}

export function normalizeAbsolutePath(input: string): string {
  const expanded = expandHome(input)
  if (!expanded) throw new Error('Path cannot be empty.')
  return path.resolve(expanded)
}

export function comparablePath(input: string): string {
  const normalized = path.normalize(path.resolve(input))
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

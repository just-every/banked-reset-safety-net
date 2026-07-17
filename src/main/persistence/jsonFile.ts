import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function readJsonFile(filePath: string): Promise<unknown | null> {
  try {
    const contents = await readFile(filePath, 'utf8')
    return JSON.parse(contents) as unknown
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${filePath}: ${error.message}`, { cause: error })
    }
    throw error
  }
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  const contents = `${JSON.stringify(value, null, 2)}\n`

  await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 })
  await rename(temporaryPath, filePath)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

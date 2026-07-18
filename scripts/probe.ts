import { homedir } from 'node:os'
import path from 'node:path'
import { CodexSession } from '../src/main/codex/codexSession'
import { resolveCodexExecutable } from '../src/main/codex/executableResolver'

interface ProbeOptions {
  home: string
  codexExecutable: string
}

const options = parseArguments(process.argv.slice(2))
const executable = await resolveCodexExecutable(options.codexExecutable)
const session = new CodexSession(executable, options.home)

try {
  const result = await session.readRateLimits()
  console.log(
    JSON.stringify(
      {
        codexHome: options.home,
        codexExecutable: executable,
        usageLimits: result.usageLimits,
        availableCount: result.availableCount,
        credits: (result.credits ?? []).map((credit) => ({
          title: credit.title,
          status: credit.status,
          resetType: credit.resetType,
          grantedAt: credit.grantedAt,
          expiresAt: credit.expiresAt,
          expiresLocal:
            credit.expiresAt === null ? null : new Date(credit.expiresAt * 1_000).toString()
        }))
      },
      null,
      2
    )
  )
} finally {
  await session.close()
}

function parseArguments(arguments_: string[]): ProbeOptions {
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    console.log('Usage: pnpm probe -- --home PATH [--codex PATH]')
    console.log('Read-only: this command never calls the reset-credit consume method.')
    process.exit(0)
  }

  let home = process.env.CODEX_HOME?.trim() || path.join(homedir(), '.codex')
  let codexExecutable = ''
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--') {
      continue
    } else if (argument === '--home') {
      home = requireValue(arguments_, ++index, '--home')
    } else if (argument === '--codex') {
      codexExecutable = requireValue(arguments_, ++index, '--codex')
    } else {
      throw new Error(`Unknown option: ${argument}`)
    }
  }

  return { home: path.resolve(home), codexExecutable }
}

function requireValue(arguments_: string[], index: number, option: string): string {
  const value = arguments_[index]
  if (!value) throw new Error(`${option} requires a value.`)
  return value
}

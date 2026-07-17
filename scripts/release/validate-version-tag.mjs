import { appendFileSync, readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const packageVersion = packageJson.version

if (typeof packageVersion !== 'string' || packageVersion.length === 0) {
  throw new Error('package.json does not contain a version.')
}

const githubRef = process.env.GITHUB_REF ?? ''
const githubRefName = process.env.GITHUB_REF_NAME ?? ''

if (githubRef.startsWith('refs/tags/')) {
  const expectedTag = `v${packageVersion}`
  if (githubRefName !== expectedTag) {
    throw new Error(`Tag ${githubRefName} does not match package.json version ${expectedTag}.`)
  }
}

const githubOutput = process.env.GITHUB_OUTPUT
if (!githubOutput) {
  throw new Error('GITHUB_OUTPUT is required.')
}

appendFileSync(githubOutput, `package-version=${packageVersion}\n`)

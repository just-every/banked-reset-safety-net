import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const projects = [
  {
    test: {
      name: 'node',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      exclude: ['tests/renderer/**']
    }
  },
  {
    plugins: [react()],
    test: {
      name: 'renderer',
      environment: 'jsdom',
      include: ['tests/renderer/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/renderer/setup.ts']
    }
  }
]

const forwardedProject = projectAfterPnpmSeparator(process.argv)

export default defineConfig({
  test: {
    projects: forwardedProject
      ? projects.filter((project) => project.test.name === forwardedProject)
      : projects
  }
})

function projectAfterPnpmSeparator(argv: string[]): string | null {
  const separator = argv.indexOf('--')
  if (separator === -1 || argv[separator + 1] !== '--project') return null
  return argv[separator + 2] ?? null
}

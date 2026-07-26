import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

describe('Linux packaging contract', () => {
  it('builds native x64 and arm64 AppImages with distinct updater channels', async () => {
    const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))

    expect(packageJson.scripts['dist:linux:x64']).toBe(
      'pnpm prepare:icons && pnpm build && electron-builder --linux AppImage --x64 --config.artifactName=Banked-Reset-Safety-Net-linux-x64.\\${ext} --publish never'
    )
    expect(packageJson.scripts['dist:linux:arm64']).toBe(
      'pnpm prepare:icons && pnpm build && electron-builder --linux AppImage --arm64 --config.artifactName=Banked-Reset-Safety-Net-linux-arm64.\\${ext} --config.publish.channel=latest-arm64 --publish never'
    )
    expect(packageJson.build.toolsets.appimage).toBe('1.0.3')
    expect(packageJson.build.linux).toMatchObject({
      icon: 'build/icons/1024x1024.png',
      executableName: 'banked-reset-safety-net',
      target: [{ target: 'AppImage', arch: ['x64', 'arm64'] }]
    })
  })

  it('ships a size-named 1024px RGBA Linux icon', async () => {
    const [genericIcon, linuxIcon] = await Promise.all([
      readFile(join(projectRoot, 'build/icon.png')),
      readFile(join(projectRoot, 'build/icons/1024x1024.png'))
    ])
    const metadata = await sharp(linuxIcon).metadata()

    expect(linuxIcon.equals(genericIcon)).toBe(true)
    expect(metadata).toMatchObject({
      format: 'png',
      width: 1024,
      height: 1024,
      channels: 4,
      hasAlpha: true
    })
  })

  it('keeps release verification native and isolated from a real Codex home', async () => {
    const [workflow, verifier] = await Promise.all([
      readFile(join(projectRoot, '.github/workflows/release.yml'), 'utf8'),
      readFile(join(projectRoot, 'scripts/release/verify-linux-artifacts.sh'), 'utf8')
    ])

    expect(workflow).toContain('runner: ubuntu-24.04')
    expect(workflow).toContain('runner: ubuntu-24.04-arm')
    expect(workflow).toContain('metadata: latest-linux.yml')
    expect(workflow).toContain('metadata: latest-arm64-linux-arm64.yml')
    expect(workflow).toContain('scripts/release/verify-linux-artifacts.sh "${{ matrix.arch }}"')

    expect(verifier).toContain("expected_machine='Advanced Micro Devices X86-64'")
    expect(verifier).toContain("expected_machine='AArch64'")
    expect(verifier).toContain('env -u CODEX_HOME')
    expect(verifier).toContain('BANKED_RESET_SAFETY_NET_USER_DATA="$smoke_user_data"')
    expect(verifier).toContain("PATH='/usr/bin:/bin'")
    expect(verifier).toContain('packaged_update_config="$app_root/resources/app-update.yml"')
    expect(verifier).toContain("`channel: ${expectedChannel}`")
    expect(verifier).toContain('settings.expiryWarningsEnabled !== true')
    expect(verifier).toContain('"$smoke_user_data/notification-state.json"')
    expect(verifier).toContain("throw new Error('The isolated Linux smoke test wrote redemption activity.')")
  })
})

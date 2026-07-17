import { describe, expect, it } from 'vitest'
import { getTrayClickAction } from '../src/main/ui/trayInteraction'

describe('tray click interaction', () => {
  it('shows a hidden window on the first click', () => {
    expect(getTrayClickAction(false, false)).toBe('show')
  })

  it('shows and focuses a visible but unfocused window', () => {
    expect(getTrayClickAction(true, false)).toBe('show')
  })

  it('hides a visible focused window', () => {
    expect(getTrayClickAction(true, true)).toBe('hide')
  })
})

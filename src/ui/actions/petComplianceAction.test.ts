import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/flags/resolve'
import { visibleToolActions } from './toolActions'

/**
 * Both-modes gating for the Pet program P6 tool surface. `petCompliance` is a
 * pro-tier flag, so the "Pet compliance" tool action is HIDDEN in Simple mode
 * (forced off by `resolveFlags`) and PRESENT in Pro. (The `petProfile` setting
 * itself is simple-tier and lives in the Scene menu — covered in
 * features/flags/petProfile.test.ts.)
 */
describe('pet-compliance tool action — both modes', () => {
  const hasPetCompliance = (mode: 'simple' | 'pro', surface: 'desktop' | 'mobile' | 'palette') =>
    visibleToolActions(surface, resolveFlags(false, {}, false, mode)).some(
      (a) => a.id === 'pet-compliance',
    )

  it('is hidden in Simple mode on every surface', () => {
    expect(hasPetCompliance('simple', 'desktop')).toBe(false)
    expect(hasPetCompliance('simple', 'mobile')).toBe(false)
    expect(hasPetCompliance('simple', 'palette')).toBe(false)
  })

  it('is present in Pro mode on every surface (desktop menu, mobile sheet, ⌘K)', () => {
    expect(hasPetCompliance('pro', 'desktop')).toBe(true)
    expect(hasPetCompliance('pro', 'mobile')).toBe(true)
    expect(hasPetCompliance('pro', 'palette')).toBe(true)
  })
})

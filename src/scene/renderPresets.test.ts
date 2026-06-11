import { describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { applyRenderPreset, RENDER_PRESETS } from './renderPresets'

describe('render presets (F4)', () => {
  it('applies all four levers in one tap', () => {
    useStore.getState().__resetForTest()
    const cozy = RENDER_PRESETS.find((p) => p.id === 'cozy-evening')
    if (!cozy) throw new Error('preset missing')
    applyRenderPreset(useStore.getState(), cozy)
    const s = useStore.getState()
    expect(s.timeMode).toBe('manual')
    expect(s.toneMapping).toBe('filmic')
    expect(s.exposure).toBeCloseTo(0.95, 5)
    expect(s.lightsMode).toBe('on')
  })

  it('every preset is internally valid', () => {
    const ids = new Set<string>()
    for (const p of RENDER_PRESETS) {
      expect(ids.has(p.id)).toBe(false)
      ids.add(p.id)
      expect(p.exposure).toBeGreaterThan(0.5)
      expect(p.exposure).toBeLessThan(2)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { defaultPart } from './editSpec'
import {
  applyFinishPreset,
  FINISH_PRESETS,
  type FinishPresetPatch,
  matchingFinishPresetId,
} from './finishPresets'

const NUM_RANGES: Partial<Record<keyof FinishPresetPatch, [number, number]>> = {
  roughness: [0, 1],
  metalness: [0, 1],
  opacity: [0, 1],
  sheen: [0, 1],
  sheenRoughness: [0, 1],
  clearcoat: [0, 1],
  clearcoatRoughness: [0, 1],
  transmission: [0, 1],
  ior: [1, 2.5],
  thickness: [0, 5],
  anisotropy: [0, 1],
  anisotropyRotation: [0, Math.PI * 2],
}

describe('FINISH_PRESETS table', () => {
  it('has ~14 presets with unique ids + labels', () => {
    expect(FINISH_PRESETS.length).toBeGreaterThanOrEqual(12)
    const ids = new Set(FINISH_PRESETS.map((p) => p.id))
    const labels = new Set(FINISH_PRESETS.map((p) => p.label))
    expect(ids.size).toBe(FINISH_PRESETS.length)
    expect(labels.size).toBe(FINISH_PRESETS.length)
  })

  it('every preset field is a finite number within its valid range', () => {
    for (const preset of FINISH_PRESETS) {
      for (const [key, value] of Object.entries(preset.patch)) {
        expect(Number.isFinite(value), `${preset.id}.${key}`).toBe(true)
        const range = NUM_RANGES[key as keyof FinishPresetPatch]
        expect(range, `${preset.id}.${key} has a known range`).toBeDefined()
        if (range && typeof value === 'number') {
          expect(value, `${preset.id}.${key} ≥ ${range[0]}`).toBeGreaterThanOrEqual(range[0])
          expect(value, `${preset.id}.${key} ≤ ${range[1]}`).toBeLessThanOrEqual(range[1])
        }
      }
    }
  })

  it('is colour-agnostic — no preset sets colour or finish', () => {
    for (const preset of FINISH_PRESETS) {
      expect(preset.patch).not.toHaveProperty('color')
      expect(preset.patch).not.toHaveProperty('finish')
    }
  })

  it('glass presets carry transmission + ior + thickness', () => {
    for (const id of ['clear-glass', 'frosted-glass']) {
      const p = FINISH_PRESETS.find((x) => x.id === id)!
      expect(p.patch.transmission).toBeGreaterThan(0)
      expect(p.patch.ior).toBeGreaterThan(1)
      expect(p.patch.thickness).toBeGreaterThan(0)
    }
  })
})

describe('applyFinishPreset', () => {
  it('applying a preset then matching returns the same id', () => {
    for (const preset of FINISH_PRESETS) {
      const part = { ...defaultPart('box'), ...applyFinishPreset(preset.id) }
      expect(matchingFinishPresetId(part)).toBe(preset.id)
    }
  })

  it('clears a textured finish so the physical layer renders', () => {
    const patch = applyFinishPreset('velvet')
    expect(patch.finish).toBeUndefined()
    expect('finish' in patch).toBe(true) // explicitly cleared, not merely absent
  })

  it('switching presets leaves no stale field (e.g. sheen → glass)', () => {
    const velvet = { ...defaultPart('box'), ...applyFinishPreset('velvet') }
    expect(velvet.sheen).toBeGreaterThan(0)
    const glass = { ...velvet, ...applyFinishPreset('clear-glass') }
    expect(glass.sheen).toBeUndefined()
    expect(glass.transmission).toBeGreaterThan(0)
    expect(matchingFinishPresetId(glass)).toBe('clear-glass')
  })

  it('an unknown id yields an empty patch', () => {
    expect(applyFinishPreset('nope')).toEqual({})
  })
})

describe('matchingFinishPresetId', () => {
  it('a plain default part matches no preset', () => {
    expect(matchingFinishPresetId(defaultPart('box'))).toBeNull()
  })

  it('a part with a textured finish never matches a preset', () => {
    const part = {
      ...defaultPart('box'),
      ...applyFinishPreset('velvet'),
      finish: 'mat:floor-wood-oak',
    }
    expect(matchingFinishPresetId(part)).toBeNull()
  })

  it('a hand-tuned look matching no preset returns null', () => {
    const part = { ...defaultPart('box'), sheen: 0.123, clearcoat: 0.456 }
    expect(matchingFinishPresetId(part)).toBeNull()
  })
})

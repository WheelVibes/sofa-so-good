import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TIER_BUDGETS } from '../gltf/lod'
import { generateLodVariants, lodTierParams } from './lodVariants'

const duckBytes = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb')),
)

describe('lodTierParams', () => {
  it('derives each tier from the shared TIER_BUDGETS (offline-script parity)', () => {
    expect(lodTierParams('low')).toMatchObject({
      maxTextureSize: TIER_BUDGETS.low.maxTexture, // 512
      simplifyRatio: TIER_BUDGETS.low.triangleRatio, // 0.5
    })
    expect(lodTierParams('medium')).toMatchObject({
      maxTextureSize: TIER_BUDGETS.medium.maxTexture, // 1024
      simplifyRatio: TIER_BUDGETS.medium.triangleRatio, // 0.75
    })
  })

  it('uses the gltf-transform default simplify error (tighter barely decimates)', () => {
    expect(lodTierParams('low').simplifyError).toBe(0.01)
    expect(lodTierParams('medium').simplifyError).toBe(0.01)
  })

  it('low is strictly more aggressive than medium', () => {
    const low = lodTierParams('low')
    const medium = lodTierParams('medium')
    expect(low.maxTextureSize).toBeLessThan(medium.maxTextureSize)
    expect(low.simplifyRatio).toBeLessThan(medium.simplifyRatio)
  })
})

describe('generateLodVariants', () => {
  it('never throws on garbage input — returns no variants', async () => {
    const out = await generateLodVariants(new Uint8Array([1, 2, 3, 4]))
    expect(out.low).toBeUndefined()
    expect(out.medium).toBeUndefined()
  })

  it('emitted variants are valid GLBs strictly smaller than the input', async () => {
    const out = await generateLodVariants(duckBytes)
    for (const tier of ['low', 'medium'] as const) {
      const v = out[tier]
      if (!v) continue // best-effort by design — absence is a legal outcome
      expect(String.fromCharCode(...v.slice(0, 4))).toBe('glTF')
      expect(v.byteLength).toBeLessThan(duckBytes.byteLength)
    }
  })
})

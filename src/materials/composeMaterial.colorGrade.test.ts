/**
 * COLOR-GRADE — per-surface colour tone tokens: `%<sat>` (saturation) and
 * `^<bright>` (brightness) in the compose/tint finish grammar, applied to the
 * effective bake colour by `adjustColorTone`. Back-compat is load-bearing:
 * token-less ids must build/parse/resolve byte-identically to before.
 */
import { describe, expect, it } from 'vitest'
import {
  adjustColorTone,
  composedMaterialDef,
  composeMaterialId,
  parseComposedMaterialId,
  parseTintMaterialId,
  recolorFinishId,
  tintedMaterialDef,
  tintMaterialId,
} from './composeMaterial'
import type { MaterialDef } from './types'

const OAK_BASE: MaterialDef = {
  id: 'floor-vinyl-oak',
  name: 'Timber vinyl strips',
  category: 'floor',
  kind: 'procedural',
  pattern: 'vinyl',
  swatch: '#d6b38d',
  uvScale: [1.2, 1.08],
}

describe('adjustColorTone', () => {
  it('is the identity at (1, 1) — same string, not just same colour', () => {
    expect(adjustColorTone('#d6b38d', 1, 1)).toBe('#d6b38d')
  })

  it('saturation 0 collapses to the luma grey (R = G = B)', () => {
    const grey = adjustColorTone('#d6b38d', 0, 1)
    const [r, g, b] = [grey.slice(1, 3), grey.slice(3, 5), grey.slice(5, 7)]
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('saturation < 1 moves channels toward each other; > 1 pushes them apart', () => {
    const spread = (hex: string) =>
      Number.parseInt(hex.slice(1, 3), 16) - Number.parseInt(hex.slice(5, 7), 16)
    const base = spread('#d6b38d')
    expect(spread(adjustColorTone('#d6b38d', 0.5, 1))).toBeLessThan(base)
    expect(spread(adjustColorTone('#d6b38d', 1.5, 1))).toBeGreaterThan(base)
  })

  it('brightness scales the value and clamps to the gamut', () => {
    expect(adjustColorTone('#808080', 1, 0.5)).toBe('#404040')
    expect(adjustColorTone('#f0f0f0', 1, 1.5)).toBe('#ffffff')
  })

  it('clamps out-of-range inputs and passes malformed colours through', () => {
    expect(adjustColorTone('#808080', -5, 1)).toBe(adjustColorTone('#808080', 0, 1))
    expect(adjustColorTone('not-a-colour', 0.5, 1)).toBe('not-a-colour')
  })
})

describe('%sat / ^bright token round-trip', () => {
  it('builds and parses both tokens on a compose id', () => {
    const id = composeMaterialId('vinyl', '#d6b38d', 1, undefined, 0.4, 0.9)
    expect(id).toBe('compose:vinyl:#d6b38d%0.4^0.9')
    const parts = parseComposedMaterialId(id)
    expect(parts?.sat).toBe(0.4)
    expect(parts?.bright).toBe(0.9)
    expect(parts?.color).toBe('#d6b38d')
  })

  it('builds and parses both tokens on a tint id, composing with scale/gloss/mode', () => {
    const id = tintMaterialId('floor-vinyl-oak', '#d6b38d', 2, 0.5, 'repaint', 0.4, 1.1)
    expect(id).toBe('tint:floor-vinyl-oak:#d6b38d@2~0.5%0.4^1.1!r')
    const parts = parseTintMaterialId(id)
    expect(parts).toMatchObject({
      baseId: 'floor-vinyl-oak',
      color: '#d6b38d',
      scale: 2,
      roughness: 0.5,
      sat: 0.4,
      bright: 1.1,
      mode: 'repaint',
    })
  })

  it('omits tokens at the defaults — token-less ids are byte-identical to before', () => {
    expect(composeMaterialId('vinyl', '#d6b38d', 1, undefined, 1, 1)).toBe('compose:vinyl:#d6b38d')
    expect(tintMaterialId('floor-vinyl-oak', '#aabbcc', 1, undefined, 'repaint', 1, 1)).toBe(
      'tint:floor-vinyl-oak:#aabbcc!r',
    )
  })

  it('legacy ids (no tokens) parse with the neutral defaults', () => {
    const parts = parseTintMaterialId('tint:floor-vinyl-oak:#aabbcc@2~0.5!r')
    expect(parts?.sat).toBe(1)
    expect(parts?.bright).toBe(1)
  })
})

describe('tone tokens land in the resolved def swatch', () => {
  it('tint def bakes the toned colour (the "greyer vinyl" path)', () => {
    const def = tintedMaterialDef('tint:floor-vinyl-oak:#d6b38d%0.3', OAK_BASE)
    expect(def?.swatch).toBe(adjustColorTone('#d6b38d', 0.3, 1))
    expect(def?.swatch).not.toBe('#d6b38d')
  })

  it('composed def bakes the toned colour', () => {
    const def = composedMaterialDef('compose:vinyl:#d6b38d%0.3^0.9')
    expect(def?.swatch).toBe(adjustColorTone('#d6b38d', 0.3, 0.9))
  })

  it('token-less defs keep the exact picked colour (back-compat)', () => {
    expect(tintedMaterialDef('tint:floor-vinyl-oak:#d6b38d', OAK_BASE)?.swatch).toBe('#d6b38d')
  })

  it('recolorFinishId carries sat/bright through a colour re-pick', () => {
    const next = recolorFinishId('tint:floor-vinyl-oak:#d6b38d%0.4^0.9!r', '#ff0000', {
      'floor-vinyl-oak': OAK_BASE,
    })
    const parts = parseTintMaterialId(next)
    expect(parts?.color).toBe('#ff0000')
    expect(parts?.sat).toBe(0.4)
    expect(parts?.bright).toBe(0.9)
  })
})

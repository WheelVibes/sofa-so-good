import { beforeEach, describe, expect, it, vi } from 'vitest'

// The measured path needs a 2D canvas the node env has no business providing —
// stub it so this file tests the DECISION, not the pixel maths (that lives in
// `textureDirection.test.ts`).
const measured = vi.fn<() => boolean | null>()
vi.mock('./analyzeTextureDirection', () => ({
  measuredQuarterTurnSafe: () => measured(),
}))

import { BUILTIN_MATERIALS } from './builtinCatalog'
import {
  allowsQuarterTurns,
  ISOTROPIC_PATTERNS,
  patternAllowsQuarterTurns,
} from './finishDirection'
import type { MaterialDef } from './types'

const proc = (pattern: string) => ({ kind: 'procedural' as const, pattern })

describe('patternAllowsQuarterTurns (the no-pixels fallback)', () => {
  it('refuses to rotate a plank floor — real floors run one direction', () => {
    // Wood/vinyl planks are laid parallel across the whole floor (to the longest
    // wall / the light / the joists); only the END STAGGER varies. A 90° cell
    // turn would lay planks across each other.
    expect(patternAllowsQuarterTurns(proc('wood'))).toBe(false)
    expect(patternAllowsQuarterTurns(proc('vinyl'))).toBe(false)
  })

  it('refuses to rotate a bonded / striated / veined tile', () => {
    // Directional tiles ship with an orientation arrow on the back precisely so
    // the whole floor reads one way.
    for (const p of ['brick', 'subway', 'porcelain', 'porcelainStone', 'stoneTile', 'marble']) {
      expect(patternAllowsQuarterTurns(proc(p))).toBe(false)
    }
  })

  it('refuses a hex grid a quarter turn (a hex lattice only survives 180°)', () => {
    expect(patternAllowsQuarterTurns(proc('hexagon'))).toBe(false)
  })

  it('allows it for patterns with no lay direction or a square 4-fold grid', () => {
    for (const p of ['terrazzo', 'concrete', 'carpet', 'tile', 'checker', 'peranakan']) {
      expect(patternAllowsQuarterTurns(proc(p))).toBe(true)
    }
  })

  it('takes the safe path for a photo scan / upload — no pattern to reason from', () => {
    expect(patternAllowsQuarterTurns({ kind: 'textured' } as MaterialDef)).toBe(false)
    expect(patternAllowsQuarterTurns({ kind: 'solid' } as MaterialDef)).toBe(false)
    expect(patternAllowsQuarterTurns(proc('not-a-pattern'))).toBe(false)
  })

  it('every isotropic entry is a real pattern used by the catalog', () => {
    // A typo here would silently downgrade a finish to 180°-only forever.
    const used = new Set(
      Object.values(BUILTIN_MATERIALS)
        .filter((m): m is Extract<MaterialDef, { kind: 'procedural' }> => m.kind === 'procedural')
        .map((m) => m.pattern),
    )
    for (const p of ISOTROPIC_PATTERNS) expect(used).toContain(p)
  })
})

describe('allowsQuarterTurns — measurement wins over the pattern prior', () => {
  const material = { map: {} } as never

  beforeEach(() => measured.mockReset())

  it('uses the measured verdict even where the prior disagrees', () => {
    // `wood` is directional in the table; if the pixels say otherwise, the
    // pixels win — that is what stops the table from rotting as the catalog
    // grows (a new pattern, an ambientCG scan, a user upload).
    measured.mockReturnValue(true)
    expect(allowsQuarterTurns(proc('wood'), material)).toBe(true)
    measured.mockReturnValue(false)
    expect(allowsQuarterTurns(proc('terrazzo'), material)).toBe(false)
  })

  it('falls back to the prior when there is nothing to measure', () => {
    // No 2D context (tests/SSR), an image still decoding, a tainted canvas.
    measured.mockReturnValue(null)
    expect(allowsQuarterTurns(proc('wood'), material)).toBe(false)
    expect(allowsQuarterTurns(proc('terrazzo'), material)).toBe(true)
  })

  it('falls back to the prior when no material is passed at all', () => {
    measured.mockReturnValue(null)
    expect(allowsQuarterTurns(proc('tile'))).toBe(true)
    expect(allowsQuarterTurns(proc('subway'))).toBe(false)
  })
})

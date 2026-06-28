/**
 * Unit tests for windowLightModifiers.ts
 *
 * Pure function tests: window↔curtain overlap detection, attenuation/tint
 * computation, tier gating (verifying flags at registry level).
 */

import { describe, expect, it } from 'vitest'
import type { WallSpec } from '../../apartment/types'
import { FEATURE_FLAGS, resolveFlags } from '../../features/featureFlags'
import type { FurnitureItem } from '../../furniture/types'
import {
  computeWindowModifiers,
  curtainDrawAmount,
  curtainWindowOverlap,
  glassTintRgb,
  hexToRgb01,
  isCurtainItem,
  isCurtainOpen,
  sceneAttenuationFactor,
  windowAttenuationFactor,
} from './windowLightModifiers'

// A simple horizontal wall going from (0,0) to (4,0) with one window
const WALL_N: WallSpec = {
  id: 'wall-test-N',
  start: [0, 0],
  end: [4, 0],
  thickness: 'external',
  cutouts: [{ kind: 'window', offset: 1.0, width: 1.4, sill: 0.95, head: 2.1, refId: 'win-test' }],
}

function makeCurtain(
  id: string,
  x: number,
  z: number,
  rotation: number,
  width: number,
  style: 'drawn' | 'open' = 'drawn',
  extra?: Record<string, string | number>,
): FurnitureItem {
  return {
    id,
    defId: 'curtains',
    position: [x, z],
    rotation,
    props: { width, height: 2.3, style, color: '#c4b9a6', pattern: 'plain', ...extra },
  }
}

function makeBlind(
  id: string,
  x: number,
  z: number,
  rotation: number,
  width: number,
  material = 'plain',
): FurnitureItem {
  return {
    id,
    defId: 'roller-blind',
    position: [x, z],
    rotation,
    props: { width, height: 2.0, material },
  }
}

// ---------------------------------------------------------------------------
// isCurtainItem
// ---------------------------------------------------------------------------
describe('isCurtainItem', () => {
  it('returns true for "curtains"', () => {
    expect(isCurtainItem('curtains')).toBe(true)
  })
  it('returns true for "roller-blind"', () => {
    expect(isCurtainItem('roller-blind')).toBe(true)
  })
  it('returns false for other defIds', () => {
    expect(isCurtainItem('sofa-3seat')).toBe(false)
    expect(isCurtainItem('bed')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isCurtainOpen
// ---------------------------------------------------------------------------
describe('isCurtainOpen', () => {
  it('returns true for style=open', () => {
    const item = makeCurtain('c1', 1.7, 0.0, 0, 1.8, 'open')
    expect(isCurtainOpen(item)).toBe(true)
  })
  it('returns false for style=drawn', () => {
    const item = makeCurtain('c1', 1.7, 0.0, 0, 1.8, 'drawn')
    expect(isCurtainOpen(item)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// curtainDrawAmount + graduated attenuation (CURTAIN-DRAW)
// ---------------------------------------------------------------------------
describe('curtainDrawAmount', () => {
  it('reads the graduated drawAmount prop, clamped', () => {
    expect(curtainDrawAmount(makeCurtain('c', 1.7, 0, 0, 1.8, 'drawn', { drawAmount: 0.5 }))).toBe(
      0.5,
    )
    expect(curtainDrawAmount(makeCurtain('c', 1.7, 0, 0, 1.8, 'drawn', { drawAmount: 9 }))).toBe(1)
    expect(curtainDrawAmount(makeCurtain('c', 1.7, 0, 0, 1.8, 'drawn', { drawAmount: -3 }))).toBe(0)
  })
  it('falls back to the legacy style flag when drawAmount is absent', () => {
    expect(curtainDrawAmount(makeCurtain('c', 1.7, 0, 0, 1.8, 'open'))).toBe(0)
    expect(curtainDrawAmount(makeCurtain('c', 1.7, 0, 0, 1.8, 'drawn'))).toBe(1)
  })
})

describe('windowAttenuationFactor is graduated by drawAmount', () => {
  const win = {
    id: 'win-test',
    wallId: WALL_N.id,
    offset: 1.0,
    width: 1.4,
    sill: 0.95,
    head: 2.1,
  }
  // A curtain centred over the window, fully covering it.
  const at = (draw: number) =>
    windowAttenuationFactor(WALL_N, win, [
      makeCurtain('c', 1.7, 0.0, 0, 2.0, 'drawn', { drawAmount: draw }),
    ])

  it('fully open (0) lets all light through; fully drawn (1) blocks most', () => {
    expect(at(0)).toBeCloseTo(1.0, 2)
    expect(at(1)).toBeLessThan(0.2)
  })
  it('half-drawn attenuates between the two extremes (light filters in)', () => {
    const half = at(0.5)
    expect(half).toBeLessThan(at(0))
    expect(half).toBeGreaterThan(at(1))
  })
})

// ---------------------------------------------------------------------------
// hexToRgb01
// ---------------------------------------------------------------------------
describe('hexToRgb01', () => {
  it('converts white correctly', () => {
    expect(hexToRgb01('#ffffff')).toEqual([1, 1, 1])
  })
  it('converts black correctly', () => {
    expect(hexToRgb01('#000000')).toEqual([0, 0, 0])
  })
  it('converts mid-red correctly', () => {
    const [r, g, b] = hexToRgb01('#ff8000')
    expect(r).toBeCloseTo(1.0, 1)
    expect(g).toBeCloseTo(0.502, 1)
    expect(b).toBeCloseTo(0, 1)
  })
  it('returns [1,1,1] for invalid input', () => {
    expect(hexToRgb01('invalid')).toEqual([1, 1, 1])
  })
})

// ---------------------------------------------------------------------------
// glassTintRgb
// ---------------------------------------------------------------------------
describe('glassTintRgb', () => {
  it('returns neutral [1,1,1] for empty string', () => {
    expect(glassTintRgb('')).toEqual([1, 1, 1])
  })
  it('returns neutral [1,1,1] for #ffffff', () => {
    expect(glassTintRgb('#ffffff')).toEqual([1, 1, 1])
  })
  it('returns the hex rgb for a warm amber tint', () => {
    const [r, g, b] = glassTintRgb('#f5d880')
    expect(r).toBeGreaterThan(0.9)
    expect(g).toBeGreaterThan(0.8)
    expect(b).toBeLessThan(0.6)
  })
})

// ---------------------------------------------------------------------------
// curtainWindowOverlap — geometry tests
// ---------------------------------------------------------------------------
describe('curtainWindowOverlap', () => {
  // Window is at offset 1.0 with width 1.4 → extent [1.0, 2.4] along wall.
  // Wall goes along X axis (angle=0). A curtain at z≈0, rotation≈0 faces the wall.

  it('returns null for a non-curtain item', () => {
    const item: FurnitureItem = {
      id: 's1',
      defId: 'sofa-3seat',
      position: [1.7, 0],
      rotation: 0,
      props: { width: 2.2 },
    }
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    expect(curtainWindowOverlap(item, WALL_N, win)).toBeNull()
  })

  it('returns null when curtain is far from the wall', () => {
    // z=2.0 is way off the wall (wall is at z=0)
    const item = makeCurtain('c1', 1.7, 2.0, 0, 1.8)
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    expect(curtainWindowOverlap(item, WALL_N, win)).toBeNull()
  })

  it('returns null when curtain is perpendicular to the wall (wrong rotation)', () => {
    // Curtain at 90° to the wall — facing the camera, not the wall
    const item = makeCurtain('c1', 1.7, 0.05, Math.PI / 2, 1.8)
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    expect(curtainWindowOverlap(item, WALL_N, win)).toBeNull()
  })

  it('returns null when curtain does not overlap the window horizontally', () => {
    // Curtain centred at x=0 width=0.6 — extent [-0.3, 0.3], window at [1.0, 2.4]
    const item = makeCurtain('c1', 0.0, 0.05, 0, 0.6)
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    expect(curtainWindowOverlap(item, WALL_N, win)).toBeNull()
  })

  it('returns full coverage for wide drawn curtain exactly covering window', () => {
    // Curtain centred at x=1.7 (middle of window), width=2.0 → extent [0.7, 2.7]
    // Window extent [1.0, 2.4] is fully within [0.7, 2.7]
    const item = makeCurtain('c1', 1.7, 0.05, 0, 2.0)
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    const result = curtainWindowOverlap(item, WALL_N, win)
    expect(result).not.toBeNull()
    expect(result!.coveredFraction).toBeCloseTo(1.0, 2)
    expect(result!.isSheer).toBe(false)
  })

  it('returns partial coverage for curtain partially overlapping window', () => {
    // Curtain centred at x=1.0, width=1.0 → extent [0.5, 1.5]
    // Window [1.0, 2.4]: overlap [1.0, 1.5] = 0.5 / 1.4 ≈ 0.357
    const item = makeCurtain('c1', 1.0, 0.05, 0, 1.0)
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    const result = curtainWindowOverlap(item, WALL_N, win)
    expect(result).not.toBeNull()
    expect(result!.coveredFraction).toBeCloseTo(0.357, 1)
  })

  it('detects sheer roller blind', () => {
    const item = makeBlind('b1', 1.7, 0.05, 0, 2.0, 'sheer')
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    const result = curtainWindowOverlap(item, WALL_N, win)
    expect(result).not.toBeNull()
    expect(result!.isSheer).toBe(true)
  })

  it('detects non-sheer roller blind', () => {
    const item = makeBlind('b1', 1.7, 0.05, 0, 2.0, 'plain')
    const win = {
      id: 'win-test',
      wallId: 'wall-test-N',
      offset: 1.0,
      width: 1.4,
      sill: 0.95,
      head: 2.1,
    }
    const result = curtainWindowOverlap(item, WALL_N, win)
    expect(result).not.toBeNull()
    expect(result!.isSheer).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// windowAttenuationFactor
// ---------------------------------------------------------------------------
describe('windowAttenuationFactor', () => {
  const win = {
    id: 'win-test',
    wallId: 'wall-test-N',
    offset: 1.0,
    width: 1.4,
    sill: 0.95,
    head: 2.1,
  }

  it('returns 1.0 with no items', () => {
    expect(windowAttenuationFactor(WALL_N, win, [])).toBeCloseTo(1.0)
  })

  it('returns near-minimum (0.05) with a fully drawn opaque curtain', () => {
    const items = [makeCurtain('c1', 1.7, 0.05, 0, 2.0, 'drawn')]
    const factor = windowAttenuationFactor(WALL_N, win, items)
    expect(factor).toBeCloseTo(0.05, 1)
  })

  it('returns 1.0 with a tied-back (open) curtain', () => {
    const items = [makeCurtain('c1', 1.7, 0.05, 0, 2.0, 'open')]
    const factor = windowAttenuationFactor(WALL_N, win, items)
    expect(factor).toBeCloseTo(1.0, 2)
  })

  it('returns partial attenuation for sheer curtain', () => {
    const items = [makeBlind('b1', 1.7, 0.05, 0, 2.0, 'sheer')]
    const factor = windowAttenuationFactor(WALL_N, win, items)
    // sheer fully covered → 0.40; partial = some value > 0.05, < 1.0
    expect(factor).toBeCloseTo(0.4, 1)
  })

  it('returns intermediate attenuation for half-covered window', () => {
    // Curtain covering ~36% of window
    const items = [makeCurtain('c1', 1.0, 0.05, 0, 1.0, 'drawn')]
    const factor = windowAttenuationFactor(WALL_N, win, items)
    // Should be between 0.05 and 1.0, closer to 1 since only partial
    expect(factor).toBeGreaterThan(0.05)
    expect(factor).toBeLessThan(1.0)
  })
})

// ---------------------------------------------------------------------------
// sceneAttenuationFactor — multi-wall, multi-window
// ---------------------------------------------------------------------------
describe('sceneAttenuationFactor', () => {
  it('returns 1.0 with no items', () => {
    expect(sceneAttenuationFactor([WALL_N], [])).toBeCloseTo(1.0)
  })

  it('returns 1.0 when wall has no window cutouts', () => {
    const wallNoWin: WallSpec = {
      id: 'wall-none',
      start: [0, 5],
      end: [4, 5],
      thickness: 'internal',
      cutouts: [],
    }
    const items = [makeCurtain('c1', 1.7, 5.05, Math.PI, 2.0)]
    expect(sceneAttenuationFactor([wallNoWin], items)).toBeCloseTo(1.0)
  })

  it('averages attenuation across multiple windows', () => {
    // Two windows: one blocked, one clear
    const wallTwoWin: WallSpec = {
      id: 'wall-two',
      start: [0, 0],
      end: [8, 0],
      thickness: 'external',
      cutouts: [
        { kind: 'window', offset: 1.0, width: 1.4, sill: 0.95, head: 2.1, refId: 'win-A' },
        { kind: 'window', offset: 5.0, width: 1.4, sill: 0.95, head: 2.1, refId: 'win-B' },
      ],
    }
    // Block only win-A (centred at x=1.7)
    const items = [makeCurtain('c1', 1.7, 0.05, 0, 2.0, 'drawn')]
    const factor = sceneAttenuationFactor([wallTwoWin], items)
    // win-A factor ≈ 0.05, win-B factor ≈ 1.0 → average ≈ 0.525
    expect(factor).toBeGreaterThan(0.4)
    expect(factor).toBeLessThan(0.7)
  })
})

// ---------------------------------------------------------------------------
// computeWindowModifiers
// ---------------------------------------------------------------------------
describe('computeWindowModifiers', () => {
  it('returns neutral modifiers with no items and no tint', () => {
    const mods = computeWindowModifiers([WALL_N], [], '')
    expect(mods.attenuation).toBeCloseTo(1.0)
    expect(mods.glassTint).toEqual([1, 1, 1])
  })

  it('returns tinted glass and low attenuation with curtain + tint', () => {
    const items = [makeCurtain('c1', 1.7, 0.05, 0, 2.0, 'drawn')]
    const mods = computeWindowModifiers([WALL_N], items, '#f5d880')
    expect(mods.attenuation).toBeLessThan(0.2) // fully blocked
    expect(mods.glassTint[0]).toBeGreaterThan(0.9) // warm tint, high red
    expect(mods.glassTint[2]).toBeLessThan(0.6) // low blue
  })
})

// ---------------------------------------------------------------------------
// Feature flag registration (tier gating)
// ---------------------------------------------------------------------------
describe('feature flag registration', () => {
  it('windowGlassTint is registered as simple tier', () => {
    const def = FEATURE_FLAGS['windowGlassTint']
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
  })

  it('curtainLightEffect is registered as simple tier', () => {
    const def = FEATURE_FLAGS['curtainLightEffect']
    expect(def).toBeDefined()
    expect(def.tier).toBe('simple')
    expect(def.default).toBe(true)
  })

  it('both flags are on in Pro mode', () => {
    // resolveFlags(isDev, overrides, isAdmin, uiMode)
    const flags = resolveFlags(false, {}, false, 'pro')
    expect(flags['windowGlassTint']).toBe(true)
    expect(flags['curtainLightEffect']).toBe(true)
  })

  it('both flags are on in Simple mode (simple tier → on in simple)', () => {
    const flags = resolveFlags(false, {}, false, 'simple')
    expect(flags['windowGlassTint']).toBe(true)
    expect(flags['curtainLightEffect']).toBe(true)
  })
})

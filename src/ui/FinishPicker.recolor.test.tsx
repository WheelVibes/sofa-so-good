// @vitest-environment happy-dom
/**
 * FINISH-RECOLOR: picking a "Custom colour" repaints the surface's CURRENT
 * finish (keeping its texture/pattern) via a `tint:<base>:<hex>!r` id instead
 * of replacing it with flat plaster paint (a bare `#hex`), and picking a new
 * texture keeps an active colour override. Plaster / solid / bare-hex actives
 * keep the legacy bare-hex behaviour; flag off restores it everywhere.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../features/featureFlags'
import type { TexturedMaterialDef } from '../materials/types'
import { useStore } from '../state/store'
import { FinishPicker } from './FinishPicker'

// Swatch thumbnails paint a 2D canvas, which happy-dom doesn't implement —
// stub just the data-URL generator (everything else in the module is real).
vi.mock('../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

// The composer's textured-base repaint preview loads + recolours an image —
// resolve null (the flat colour-block fallback) in happy-dom.
vi.mock('../materials/recolor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  recolorThumbnailDataUrl: async () => null,
}))

const ROOM = 'livingDining'
const HEX = '#ff0000'

/** A user-uploaded photo texture — the case the repaint mode exists for. */
const TEX: TexturedMaterialDef = {
  id: 'user-tex-1',
  name: 'Linen weave',
  category: 'floor',
  kind: 'textured',
  source: 'user',
  swatch: '#c8bfae',
  textures: { albedo: 'blob:albedo' },
  uvScale: [1, 1],
}

/** Click the active surface's "Recent colour" swatch — only one surface block
 *  mounts at a time under the tab row, so switch to the target surface's tab
 *  first (the panel opens on Floor). Drives the same `onCustom` path as the
 *  picker. */
function clickRecentColor(surface: 'floor' | 'wall' | 'ceiling' = 'floor') {
  if (surface !== 'floor') {
    const tab = surface === 'wall' ? 'Walls' : 'Ceiling'
    fireEvent.click(screen.getByRole('tab', { name: tab }))
  }
  fireEvent.click(screen.getByRole('button', { name: `Recent colour ${HEX}` }))
}

beforeEach(() => {
  // Tab selection persists to localStorage (LAST_SURFACE_KEY); clear it so each
  // test starts on the default Floor tab regardless of prior tab clicks.
  try {
    localStorage.clear()
  } catch {
    // ignore (unavailable storage)
  }
  useStore.getState().__resetForTest?.()
  useStore.getState().selectRoom(ROOM)
  useStore.getState().pushRecentColor(HEX)
})

afterEach(() => {
  useStore.getState().selectRoom(null)
})

describe('finishRecolor flag', () => {
  it('is registered as a simple-tier, default-on, prod-safe flag', () => {
    const flag = FEATURE_FLAGS.finishRecolor
    expect(flag).toBeDefined()
    expect(flag.tier).toBe('simple')
    expect(flag.default).toBe(true)
    expect(flag.devOnly).toBeUndefined()
  })

  it('resolves ON in BOTH Simple and Pro modes (both build kinds)', () => {
    expect(resolveFlags(false, {}, false, 'simple').finishRecolor).toBe(true)
    expect(resolveFlags(false, {}, false, 'pro').finishRecolor).toBe(true)
    expect(resolveFlags(true, {}, false, 'simple').finishRecolor).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').finishRecolor).toBe(true)
  })
})

describe('FinishPicker — custom colour repaints the current finish', () => {
  it('textured (uploaded) active floor → a repaint tint id, not flat paint', () => {
    useStore.getState().addUserMaterial(TEX)
    useStore.getState().setFloorFinish(ROOM, 'user-tex-1')
    render(<FinishPicker />)
    clickRecentColor()
    expect(useStore.getState().finishes.floor[ROOM]).toBe(`tint:user-tex-1:${HEX}!r`)
    // The colour is still recorded as a recent colour.
    expect(useStore.getState().recentColors).toContain(HEX)
  })

  it('textured catalog active floor (PH wood) → a repaint tint id', () => {
    // 'floor-wood-oak' resolves to the generated Poly Haven textured def.
    useStore.getState().setFloorFinish(ROOM, 'floor-wood-oak')
    render(<FinishPicker />)
    clickRecentColor()
    expect(useStore.getState().finishes.floor[ROOM]).toBe(`tint:floor-wood-oak:${HEX}!r`)
  })

  it('procedural non-plaster active floor (builtin parquet) → a repaint tint id', () => {
    useStore.getState().setFloorFinish(ROOM, 'floor-parquet-oak')
    render(<FinishPicker />)
    clickRecentColor()
    expect(useStore.getState().finishes.floor[ROOM]).toBe(`tint:floor-parquet-oak:${HEX}!r`)
  })

  it('re-colours an existing tint in place, keeping its base + scale + gloss', () => {
    useStore.getState().setFloorFinish(ROOM, 'tint:floor-wood-oak:#00ff00@2~0.5')
    render(<FinishPicker />)
    clickRecentColor()
    expect(useStore.getState().finishes.floor[ROOM]).toBe(`tint:floor-wood-oak:${HEX}@2~0.5!r`)
  })

  it('plaster (paint) active wall stays legacy flat paint (bare hex)', () => {
    useStore.getState().setWallFinish(ROOM, 'wall-paint-white')
    render(<FinishPicker />)
    clickRecentColor('wall')
    expect(useStore.getState().finishes.walls[ROOM]).toBe(HEX)
  })

  it('bare-hex active floor stays legacy flat paint (bare hex)', () => {
    useStore.getState().setFloorFinish(ROOM, '#123456')
    render(<FinishPicker />)
    clickRecentColor()
    expect(useStore.getState().finishes.floor[ROOM]).toBe(HEX)
  })

  it('patterned active ceiling (subway tile) → a repaint tint id', () => {
    useStore.getState().setCeilingFinish(ROOM, 'wall-subway-white')
    render(<FinishPicker />)
    clickRecentColor('ceiling')
    expect(useStore.getState().finishes.ceiling[ROOM]).toBe(`tint:wall-subway-white:${HEX}!r`)
  })

  it('flag OFF → custom colour writes the legacy bare hex even on a textured active', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, finishRecolor: false },
    })
    useStore.getState().addUserMaterial(TEX)
    useStore.getState().setFloorFinish(ROOM, 'user-tex-1')
    render(<FinishPicker />)
    clickRecentColor()
    expect(useStore.getState().finishes.floor[ROOM]).toBe(HEX)
  })
})

describe('FinishPicker — picking a new texture keeps the colour override', () => {
  it('selecting a plain finish while a tint is active re-tints the NEW base', () => {
    useStore.getState().setFloorFinish(ROOM, `tint:floor-wood-oak:${HEX}~0.5!r`)
    render(<FinishPicker />)
    // The grid tile's accessible name carries the provider badge ("… PH");
    // ^-anchored so the "Designer pick: …" row never matches.
    fireEvent.click(screen.getAllByRole('button', { name: /^Walnut planks/ })[0])
    // Colour + gloss survive; scale resets (it's base-specific); repaint mode.
    expect(useStore.getState().finishes.floor[ROOM]).toBe(`tint:floor-wood-walnut:${HEX}~0.5!r`)
    // Recently Used records the PLAIN base id (the texture), not the tinted id.
    expect(useStore.getState().recentFinishes).toContain('floor-wood-walnut')
  })

  it('flag OFF → selecting a plain finish applies it plainly (legacy)', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, finishRecolor: false },
    })
    useStore.getState().setFloorFinish(ROOM, `tint:floor-wood-oak:${HEX}!r`)
    render(<FinishPicker />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Walnut planks/ })[0])
    expect(useStore.getState().finishes.floor[ROOM]).toBe('floor-wood-walnut')
  })
})

describe('FinishPicker — colour-override chip', () => {
  it('clears the override back to the plain base finish', () => {
    useStore.getState().setFloorFinish(ROOM, `tint:floor-wood-oak:${HEX}!r`)
    render(<FinishPicker />)
    // Only the active (Floor) tab's group mounts → exactly one chip.
    const clear = screen.getAllByRole('button', { name: 'Remove colour override' })
    expect(clear).toHaveLength(1)
    fireEvent.click(clear[0])
    expect(useStore.getState().finishes.floor[ROOM]).toBe('floor-wood-oak')
  })

  it('is absent when the flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, finishRecolor: false },
    })
    useStore.getState().setFloorFinish(ROOM, `tint:floor-wood-oak:${HEX}!r`)
    render(<FinishPicker />)
    expect(screen.queryByRole('button', { name: 'Remove colour override' })).toBeNull()
  })
})

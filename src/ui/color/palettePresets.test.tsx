// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/featureFlags'
import { cleanPalette, MAX_PALETTE_COLORS } from '../../state/slices/colorPaletteSlice'
import { useStore } from '../../state/store'
import { MasterPaletteEditor } from './MasterPaletteEditor'
import { PALETTE_PRESETS } from './palettePresets'

describe('PALETTE_PRESETS data (R3-FEAT-2)', () => {
  it('every preset has a unique id and a non-empty name', () => {
    const ids = PALETTE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(PALETTE_PRESETS.every((p) => p.name.trim().length > 0)).toBe(true)
    expect(PALETTE_PRESETS.length).toBeGreaterThanOrEqual(6)
  })

  it('every colour is valid #rrggbb hex, within the palette cap, and survives cleanPalette intact', () => {
    for (const p of PALETTE_PRESETS) {
      expect(p.colors.length).toBeGreaterThanOrEqual(3)
      expect(p.colors.length).toBeLessThanOrEqual(MAX_PALETTE_COLORS)
      for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/)
      // No dupes / invalid entries — cleanPalette must be a no-op.
      expect(cleanPalette(p.colors)).toEqual(p.colors)
    }
  })
})

describe('palettePresets flag tier (both modes)', () => {
  it('is pro-tier: forced off in Simple, on in Pro', () => {
    expect(resolveFlags(false, {}, false, 'simple').palettePresets).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').palettePresets).toBe(true)
  })
})

describe('MasterPaletteEditor preset gallery', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('Pro: renders the gallery and applying a preset sets the master palette (undoable)', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    render(<MasterPaletteEditor />)
    const btn = screen.getByRole('button', { name: /Scandinavian calm/i })
    fireEvent.click(btn)
    const preset = PALETTE_PRESETS.find((p) => p.id === 'scandi-calm')
    expect(useStore.getState().masterPalette).toEqual(preset?.colors)
    useStore.getState().undo()
    expect(useStore.getState().masterPalette).toEqual([])
  })

  it('Pro + active room override: preset applies to the room, not the master', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    useStore.getState().setMasterPalette(['#111111'])
    useStore.getState().setRoomPalette('livingDining', ['#222222'])
    render(<MasterPaletteEditor roomId="livingDining" />)
    fireEvent.click(screen.getByRole('button', { name: /Japandi/i }))
    const preset = PALETTE_PRESETS.find((p) => p.id === 'japandi')
    expect(useStore.getState().roomPalettes['livingDining']).toEqual(preset?.colors)
    expect(useStore.getState().masterPalette).toEqual(['#111111'])
  })

  it('Simple: the editor renders (masterPalette is simple-tier) but the pro-tier gallery is hidden', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    render(<MasterPaletteEditor />)
    // The editor itself is present…
    expect(screen.getByText('Apartment palette')).toBeTruthy()
    // …but no preset button is.
    expect(screen.queryByRole('button', { name: /palette preset/i })).toBeNull()
    expect(screen.queryByText('Palette presets')).toBeNull()
  })
})

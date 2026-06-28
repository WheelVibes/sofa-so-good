import { beforeEach, describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/flags/resolve'
import { useStore } from '../store'
import { effectivePalette } from './colorPaletteSlice'

describe('masterPalette feature flag (simple tier)', () => {
  it('is enabled in both Simple and Pro mode', () => {
    for (const mode of ['simple', 'pro'] as const) {
      expect(resolveFlags(true, {}, false, mode).masterPalette).toBe(true)
    }
  })
})

describe('effectivePalette', () => {
  it('returns the room override when present, else the master', () => {
    const master = ['#111111', '#222222']
    const rooms = { living: ['#aaaaaa'] }
    expect(effectivePalette(master, rooms, 'living')).toEqual(['#aaaaaa'])
    expect(effectivePalette(master, rooms, 'bedroom')).toEqual(master)
    expect(effectivePalette(master, rooms, null)).toEqual(master)
    expect(effectivePalette(master, {}, 'living')).toEqual(master)
  })
})

describe('colorPaletteSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('sets the master palette, sanitising + deduping + capping at 5', () => {
    useStore
      .getState()
      .setMasterPalette(['#ABC', '#aabbcc', 'nope', '#123456', '#234567', '#345678', '#456789'])
    const p = useStore.getState().masterPalette
    // '#ABC' → '#aabbcc' dupes the explicit '#aabbcc' (deduped); 'nope' dropped;
    // capped at 5.
    expect(p).toEqual(['#aabbcc', '#123456', '#234567', '#345678', '#456789'])
  })

  it('sets and clears a per-room override', () => {
    useStore.getState().setRoomPalette('living', ['#ff0000', '#00ff00'])
    expect(useStore.getState().roomPalettes.living).toEqual(['#ff0000', '#00ff00'])
    useStore.getState().setRoomPalette('living', null)
    expect(useStore.getState().roomPalettes.living).toBeUndefined()
  })

  it('clears the override when given an all-invalid palette', () => {
    useStore.getState().setRoomPalette('living', ['#ff0000'])
    useStore.getState().setRoomPalette('living', ['nope', 'bad'])
    expect(useStore.getState().roomPalettes.living).toBeUndefined()
  })
})

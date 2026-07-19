// @vitest-environment happy-dom
/**
 * Tests for the FinishPicker's "Accent walls" management section (v0.9.0.45) —
 * surfaces + clears a room's per-wall accent finishes (`finishes.wallAccents`,
 * keyed `wallId:roomId`) from the per-room panel. Gated by `wallAccentPicker`.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { roomWalls } from '../materials/roomWalls'
import { useStore } from '../state/store'
import { FinishPicker } from './FinishPicker'

vi.mock('../materials/procedural/generators', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  proceduralThumbnailDataUrl: () => 'data:,',
}))

const ROOM = 'livingDining'

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
})

afterEach(() => {
  useStore.getState().selectRoom(null)
})

/** The accent-walls section lives under the Walls surface tab — the panel
 *  opens on Floor, so switch to Walls before asserting the section. */
function openWallsTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Walls' }))
}

describe('FinishPicker — accent walls section', () => {
  it('shows the section with a tap-a-wall hint when the room has no accents', () => {
    render(<FinishPicker />)
    openWallsTab()
    expect(screen.getByText('Accent walls')).toBeInTheDocument()
    expect(screen.getByText(/Tap any wall in the 3D view/i)).toBeInTheDocument()
  })

  it('lists an existing accent and clears it on demand', () => {
    useStore.getState().setWallAccent(`w1:${ROOM}`, 'wall-beige')
    render(<FinishPicker />)
    openWallsTab()
    // The accent is listed with a remove control.
    const clear = screen.getByRole('button', { name: /Remove accent wall/i })
    expect(clear).toBeInTheDocument()
    expect(useStore.getState().finishes.wallAccents[`w1:${ROOM}`]).toBe('wall-beige')
    fireEvent.click(clear)
    expect(useStore.getState().finishes.wallAccents[`w1:${ROOM}`]).toBeUndefined()
  })

  it('only lists accents for the SELECTED room, not other rooms', () => {
    useStore.getState().setWallAccent(`w1:${ROOM}`, 'wall-beige')
    useStore.getState().setWallAccent('w9:bedroom', 'wall-concrete')
    render(<FinishPicker />)
    openWallsTab()
    // Exactly one remove control — the other room's accent is not listed here.
    expect(screen.getAllByRole('button', { name: /Remove accent wall/i })).toHaveLength(1)
  })

  it('hides the section when the wallAccentPicker flag is off', () => {
    useStore.setState({
      featureFlags: { ...useStore.getState().featureFlags, wallAccentPicker: false },
    })
    render(<FinishPicker />)
    openWallsTab()
    expect(screen.queryByText('Accent walls')).toBeNull()
  })
})

describe('FinishPicker — create accent wall (ACCENT-CREATE)', () => {
  // The accent section rides the simple-tier `wallAccentPicker` flag, so the
  // "Add accent wall" affordance must be present in BOTH Simple and Pro.
  for (const mode of ['simple', 'pro'] as const) {
    it(`offers an "Add accent wall" picker in ${mode} mode`, () => {
      useStore.getState().setUiMode(mode)
      useStore.getState().reresolveFeatureFlags()
      useStore.getState().selectRoom(ROOM)
      render(<FinishPicker />)
      openWallsTab()
      expect(screen.getByRole('combobox', { name: 'Add an accent wall' })).toBeInTheDocument()
    })
  }

  it('picking a wall hands off to the finish-choice panel (selects that wall)', () => {
    render(<FinishPicker />)
    openWallsTab()
    const add = screen.getByRole('combobox', { name: 'Add an accent wall' })
    fireEvent.click(add)
    // Options are the room's walls, compass-labelled. Pick the first real one.
    const option = screen.getAllByRole('option').find((o) => /wall ·/i.test(o.textContent ?? ''))
    expect(option).toBeDefined()
    if (!option) return
    fireEvent.click(option)
    // Handoff: the wall is now selected (opens the WallAccentPicker finish choice).
    const sel = useStore.getState().selectedWall
    expect(sel?.roomId).toBe(ROOM)
    expect(sel?.wallId).toBeTruthy()
  })

  it('round-trips: creating an accent on a room wall sets finishes.wallAccents', () => {
    // Store-level create: enumerate the room's walls (same helper the picker
    // uses) then apply an accent finish → it lands under the `wallId:roomId` key.
    const s = useStore.getState()
    const wall = roomWalls(s.floorPlan, ROOM)[0]
    expect(wall).toBeDefined()
    const key = `${wall.wallId}:${ROOM}`
    s.setWallAccent(key, 'wall-brick-red')
    expect(useStore.getState().finishes.wallAccents[key]).toBe('wall-brick-red')
    useStore.getState().clearWallAccent(key)
    expect(useStore.getState().finishes.wallAccents[key]).toBeUndefined()
  })
})

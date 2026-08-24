// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RoomId } from '../../apartment/types'
import { isFeatureEnabled } from '../../features/featureFlags'
import { useStore } from '../../state/store'
import { DirectionRow, degreesOf, isPreset } from './DirectionRow'

const room = () => useStore.getState().floorPlan.rooms.find((r) => r.id === 'livingDining')

describe('degreesOf / isPreset', () => {
  it('renders a stored radian angle as positive degrees', () => {
    expect(degreesOf(undefined)).toBe(0)
    expect(degreesOf(Math.PI / 2)).toBe(90)
    expect(degreesOf(-Math.PI / 2)).toBe(270)
  })

  it('matches a preset through float drift, and rejects a nearby custom angle', () => {
    expect(isPreset(Math.PI / 4 + 1e-9, 45)).toBe(true)
    expect(isPreset((44 * Math.PI) / 180, 45)).toBe(false)
  })
})

describe('DirectionRow', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('sets the floor lay direction from a preset', () => {
    render(<DirectionRow roomId={'livingDining' as RoomId} surface="floor" />)
    fireEvent.click(screen.getByRole('radio', { name: '90°' }))
    expect(room()?.floorTexAngle).toBeCloseTo(Math.PI / 2, 6)
    // The wall is a separate surface and must not follow the floor.
    expect(room()?.wallTexAngle).toBeUndefined()
  })

  it('sets the wall direction independently', () => {
    render(<DirectionRow roomId={'livingDining' as RoomId} surface="wall" />)
    fireEvent.click(screen.getByRole('radio', { name: '45°' }))
    expect(room()?.wallTexAngle).toBeCloseTo(Math.PI / 4, 6)
    expect(room()?.floorTexAngle).toBeUndefined()
  })

  it('shows the stored angle, and marks no preset for a custom one', () => {
    useStore.getState().setSurfaceTexture('livingDining' as RoomId, 'floor', { angle: 0.2 })
    render(<DirectionRow roomId={'livingDining' as RoomId} surface="floor" />)
    for (const label of ['0°', '45°', '90°']) {
      expect(screen.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'false')
    }
    expect(screen.getByDisplayValue(String(degreesOf(0.2)))).toBeInTheDocument()
  })

  it('is reachable in BOTH modes — direction is core to picking a finish', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().resetFeatureFlags()
    expect(isFeatureEnabled('floorTexture')).toBe(true)
    expect(isFeatureEnabled('wallTexture')).toBe(true)
    useStore.getState().setUiMode('simple')
    expect(isFeatureEnabled('floorTexture')).toBe(true)
    expect(isFeatureEnabled('wallTexture')).toBe(true)
  })
})

describe('DirectionRow — per wall FACE', () => {
  const KEY = 'wall-int-b3-LD:livingDining'

  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('writes to the one face, not the room', () => {
    render(<DirectionRow roomId="livingDining" surface="wall" wallId="wall-int-b3-LD" />)
    fireEvent.click(screen.getByRole('radio', { name: '90°' }))
    expect(useStore.getState().finishes.wallTex[KEY]?.angle).toBeCloseTo(Math.PI / 2, 6)
    // The room default is untouched — the other walls keep running as they were.
    expect(room()?.wallTexAngle).toBeUndefined()
  })

  it('shows the room direction until the face overrides it', () => {
    useStore.getState().setSurfaceTexture('livingDining', 'wall', { angle: Math.PI / 4 })
    render(<DirectionRow roomId="livingDining" surface="wall" wallId="wall-int-b3-LD" />)
    // Inherited, so the room's 45° preset reads as active…
    expect(screen.getByRole('radio', { name: '45°' })).toHaveAttribute('aria-checked', 'true')
    // …and there is nothing to "match" yet.
    expect(screen.queryByText('Match room direction')).not.toBeInTheDocument()
  })

  it('offers "Match room direction" once the face differs, and clearing restores inheritance', () => {
    useStore.getState().setSurfaceTexture('livingDining', 'wall', { angle: Math.PI / 4 })
    useStore.getState().setWallFaceTexture(KEY, { angle: Math.PI / 2 })
    render(<DirectionRow roomId="livingDining" surface="wall" wallId="wall-int-b3-LD" />)
    fireEvent.click(screen.getByText('Match room direction'))
    expect(useStore.getState().finishes.wallTex[KEY]).toBeUndefined()
  })

  it('drops an override set back to its default rather than storing an empty one', () => {
    const st = useStore.getState()
    st.setWallFaceTexture(KEY, { angle: 1, scale: 2 })
    st.setWallFaceTexture(KEY, { angle: 0 })
    expect(useStore.getState().finishes.wallTex[KEY]).toEqual({ scale: 2 })
    st.setWallFaceTexture(KEY, { scale: 1 })
    expect(useStore.getState().finishes.wallTex[KEY]).toBeUndefined()
  })

  it('keeps the two sides of one wall independent', () => {
    const st = useStore.getState()
    st.setWallFaceTexture('wall-int-b3-LD:livingDining', { angle: Math.PI / 2 })
    st.setWallFaceTexture('wall-int-b3-LD:bedroom3', { angle: Math.PI / 4 })
    const tex = useStore.getState().finishes.wallTex
    expect(tex['wall-int-b3-LD:livingDining']?.angle).toBeCloseTo(Math.PI / 2, 6)
    expect(tex['wall-int-b3-LD:bedroom3']?.angle).toBeCloseTo(Math.PI / 4, 6)
  })
})

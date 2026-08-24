import { describe, expect, it } from 'vitest'
import { isFeatureEnabled } from '../../features/featureFlags'
import type { FloorPlan, PlanRoom } from '../../floorplan/types'
import { useStore } from '../../state/store'
import { wallTexTransform, wallTexTransformFor } from './wallTexTransform'

const room = (over: Partial<PlanRoom> = {}) =>
  ({ id: 'living', name: 'Living', origin: [0, 0], width: 4, depth: 3, ...over }) as PlanRoom

describe('wallTexTransform', () => {
  it('is undefined at the identity, so the untouched-UV path stays byte-identical', () => {
    expect(wallTexTransform(room())).toBeUndefined()
    expect(wallTexTransform(null)).toBeUndefined()
    expect(wallTexTransform(undefined)).toBeUndefined()
  })

  it('carries either dial on its own', () => {
    expect(wallTexTransform(room({ wallTexScale: 2 }))).toEqual({ scale: 2, angle: undefined })
    expect(wallTexTransform(room({ wallTexAngle: 0.5 }))).toEqual({ scale: undefined, angle: 0.5 })
  })

  it('is independent of the floor dials — a room can turn one and not the other', () => {
    expect(wallTexTransform(room({ floorTexScale: 3, floorTexAngle: 1 }))).toBeUndefined()
  })

  it('resolves by room id against a plan, and ignores an unknown id', () => {
    const plan = { rooms: [room({ wallTexScale: 1.5 })] } as FloorPlan
    expect(wallTexTransformFor(plan, 'living')).toEqual({ scale: 1.5, angle: undefined })
    expect(wallTexTransformFor(plan, 'nope')).toBeUndefined()
    expect(wallTexTransformFor(plan, undefined)).toBeUndefined()
  })
})

describe('wallTexture flag gating (Simple vs Pro)', () => {
  it('is part of the core finish loop: ON in BOTH modes, like floorTexture', () => {
    useStore.getState().setUiMode('pro')
    useStore.getState().resetFeatureFlags()
    expect(isFeatureEnabled('wallTexture')).toBe(true)
    useStore.getState().setUiMode('simple')
    expect(isFeatureEnabled('wallTexture')).toBe(true)
    expect(useStore.getState().featureFlags.wallTexture).toBe(true)
  })
})

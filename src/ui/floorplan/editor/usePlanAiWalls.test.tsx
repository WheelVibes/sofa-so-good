// @vitest-environment happy-dom
/**
 * Guard-path tests for the `usePlanAiWalls` hook extracted from FloorPlanEditor
 * (v0.9.0.47). The happy path is network+canvas heavy; these cover the cheap,
 * important early returns — no backdrop, and the security endpoint gate — so the
 * API key is never sent to an insecure/unrecognised endpoint.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ai = vi.hoisted(() => ({
  AiPlanError: class AiPlanError extends Error {},
  classifyVisionEndpoint: vi.fn(),
  getVisionKey: vi.fn(),
  getVisionUrl: vi.fn(() => 'https://api.example.com'),
  recognizeFloorPlan: vi.fn(),
  setVisionKey: vi.fn(),
}))
vi.mock('../../../ai/floorPlanAi', () => ai)

import { useStore } from '../../../state/store'
import type { Backdrop } from './planConstants'
import { applyAiPlanDraft, usePlanAiWalls } from './usePlanAiWalls'

const BACKDROP: Backdrop = {
  url: 'blob:x',
  w: 100,
  h: 100,
  opacity: 0.5,
  mPerPx: 0.01,
  ox: 0,
  oz: 0,
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  ai.classifyVisionEndpoint.mockReset()
  ai.getVisionKey.mockReset()
  ai.recognizeFloorPlan.mockReset()
  ai.setVisionKey.mockReset()
  ai.getVisionUrl.mockReturnValue('https://api.example.com')
})

afterEach(() => {
  useStore.getState().__resetForTest?.()
})

describe('usePlanAiWalls', () => {
  it('is a no-op with no backdrop (never touches the vision key or model)', async () => {
    const { result } = renderHook(() => usePlanAiWalls(null, () => {}))
    await act(async () => {
      await result.current.runAiWalls()
    })
    expect(ai.getVisionKey).not.toHaveBeenCalled()
    expect(ai.recognizeFloorPlan).not.toHaveBeenCalled()
    expect(result.current.aiBusy).toBe(false)
  })

  it('refuses to send the key to an insecure endpoint (security gate)', async () => {
    ai.getVisionKey.mockReturnValue('sk-key')
    ai.classifyVisionEndpoint.mockReturnValue({
      secure: false,
      trusted: false,
      host: 'evil.test',
      reason: 'plaintext http',
    })
    const notify = vi.spyOn(useStore.getState().notify, 'start')
    const { result } = renderHook(() => usePlanAiWalls(BACKDROP, () => {}))
    await act(async () => {
      await result.current.runAiWalls()
    })
    expect(ai.recognizeFloorPlan).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
    expect(result.current.aiBusy).toBe(false)
  })
})

describe('applyAiPlanDraft (store apply path — no network)', () => {
  it('drafts walls and snaps openings onto their nearest wall', () => {
    // A 4 m south wall (z = 0) + a 3 m east wall (x = 4). A door centred at
    // (2,0) lands on the first wall, a window near (4,1.5) on the second.
    const counts = applyAiPlanDraft({
      walls: [
        { x1: 0, z1: 0, x2: 4, z2: 0, external: true },
        { x1: 4, z1: 0, x2: 4, z2: 3, external: true },
      ],
      openings: [
        { kind: 'door', x: 2, z: 0, width: 0.9 },
        { kind: 'window', x: 4, z: 1.5, width: 1.2 },
        { kind: 'door', x: 20, z: 20, width: 0.9 }, // far from any wall → dropped
      ],
    })
    expect(counts).toEqual({ walls: 2, openings: 2, rooms: 0 })
    const plan = useStore.getState().floorPlan
    // The AI draft starts from an EMPTY canvas, so the plan holds exactly the
    // walls the model returned — it used to inherit the 4 starter-shell walls
    // and draft on top of them.
    expect(plan.walls).toHaveLength(2)
    expect(plan.openings).toHaveLength(2)
    const kinds = plan.openings.map((o) => o.kind).sort()
    expect(kinds).toEqual(['door', 'window'])
    // Every opening references a real wall and stays within its span.
    for (const o of plan.openings) {
      const wall = plan.walls.find((w) => w.id === o.wallId)
      expect(wall).toBeDefined()
      expect(o.offset).toBeGreaterThanOrEqual(0)
    }
  })

  it('is walls-only when the model returns no openings (backward compatible)', () => {
    const counts = applyAiPlanDraft({
      walls: [{ x1: 0, z1: 0, x2: 4, z2: 0 }],
      openings: [],
    })
    expect(counts).toEqual({ walls: 1, openings: 0, rooms: 0 })
    expect(useStore.getState().floorPlan.openings).toHaveLength(0)
  })

  it('creates named rooms from a generated result (text→plan)', () => {
    const counts = applyAiPlanDraft({
      walls: [
        { x1: 0, z1: 0, x2: 4, z2: 0, external: true },
        { x1: 4, z1: 0, x2: 4, z2: 3, external: true },
      ],
      openings: [],
      rooms: [
        { name: 'Living', x: 0, z: 0, width: 4, depth: 3 },
        { name: 'Kitchen', x: 4, z: 0, width: 2.5, depth: 3 },
      ],
    })
    expect(counts).toEqual({ walls: 2, openings: 0, rooms: 2 })
    const plan = useStore.getState().floorPlan
    // A fresh blank plan seeds one default room; the 2 AI rooms add on top.
    const names = plan.rooms.map((r) => r.name)
    expect(names).toContain('Living')
    expect(names).toContain('Kitchen')
    const living = plan.rooms.find((r) => r.name === 'Living')
    expect(living?.origin).toEqual([0, 0])
    expect(living?.width).toBe(4)
    expect(living?.depth).toBe(3)
  })
})

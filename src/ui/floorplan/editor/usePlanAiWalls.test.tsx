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
import { usePlanAiWalls } from './usePlanAiWalls'

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
    const { result } = renderHook(() => usePlanAiWalls(null))
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
    const { result } = renderHook(() => usePlanAiWalls(BACKDROP))
    await act(async () => {
      await result.current.runAiWalls()
    })
    expect(ai.recognizeFloorPlan).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }))
    expect(result.current.aiBusy).toBe(false)
  })
})

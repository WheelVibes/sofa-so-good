// @vitest-environment happy-dom
/**
 * Smoke test for the `usePlanViewport` hook extracted from FloorPlanEditor
 * (v0.9.0.49). The hook's zoom/pan/fit mechanics are DOM-layout-bound (scroll,
 * getBoundingClientRect, ResizeObserver, rAF) and verified end-to-end by the
 * floorplan scenarios; this just pins the pure surface — initial scale, the
 * metre→pixel mapping, and the returned refs/handlers — so a wiring regression
 * in the extraction is caught.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../../floorplan/defaultPlan'
import { usePlanViewport } from './usePlanViewport'

describe('usePlanViewport', () => {
  it('exposes a sane initial viewport for a real plan', () => {
    const plan = buildDefaultPlan()
    // editing=false → the DOM effects (measure/wheel/centre) are inert.
    const { result } = renderHook(() => usePlanViewport(plan, plan, false))
    const v = result.current
    expect(v.zoom).toBe(1)
    expect(v.ew).toBeGreaterThan(0)
    expect(v.ed).toBeGreaterThan(0)
    expect(v.PX).toBeGreaterThan(0)
    // W/H span the plan plus the grid margin, so they exceed the plan px extent.
    expect(v.W).toBeGreaterThan(v.ew * v.PX)
    expect(v.H).toBeGreaterThan(v.ed * v.PX)
  })

  it('maps metres → pixels through toPx (grid-margin offset, scaled by PX)', () => {
    const plan = buildDefaultPlan()
    const { result } = renderHook(() => usePlanViewport(plan, plan, false))
    const { toPx, PX } = result.current
    // toPx is affine in metres with slope PX; the delta between two points is
    // exactly the metre delta × PX (margin offset cancels).
    expect(toPx(3) - toPx(1)).toBeCloseTo(2 * PX)
    expect(toPx(0)).toBeGreaterThan(0) // the grid margin pushes origin off 0
  })

  it('returns the refs + handlers the editor dispatch reads', () => {
    const plan = buildDefaultPlan()
    const { result } = renderHook(() => usePlanViewport(plan, plan, false))
    const v = result.current
    for (const ref of [
      v.svgRef,
      v.canvasRef,
      v.panRef,
      v.panDidMove,
      v.touchPts,
      v.pinch,
      v.zoomRef,
    ]) {
      expect(ref).toHaveProperty('current')
    }
    expect(typeof v.zoomToPoint).toBe('function')
    expect(typeof v.zoomAroundCentre).toBe('function')
    expect(typeof v.centerPlan).toBe('function')
    expect(typeof v.resetView).toBe('function')
  })
})

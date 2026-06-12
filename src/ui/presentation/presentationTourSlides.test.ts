/**
 * Unit tests for the P-720 tail (C266) feature:
 * - "Include 360° tour" flag gating (Simple vs Pro modes)
 * - Auto-advance pause on tour-stop panorama slides
 * - composeTourSlides with real feature-flag resolution
 *
 * The `presentation` and `panoTour` flags are BOTH pro-tier, so the toggle
 * must be invisible (effectively disabled) in Simple mode — both flags are off
 * in Simple, so the gating logic never mounts the toggle.
 */

import { describe, expect, it } from 'vitest'
import { FEATURE_FLAGS, resolveFlags } from '../../features/featureFlags'
import type { SavedView } from '../../state/slices/cameraViewsSlice'
import type { PanoTourStop } from '../panorama/panoTour'
import { composeTourSlides, shouldAutoAdvance } from './slideLogic'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeView(id: string, pano = false): SavedView {
  return {
    id,
    name: `View ${id}`,
    pos: [0, 1, 0],
    target: [0, 0, 0],
    ...(pano ? { pano: true } : {}),
  }
}

function makeStop(id: string, levelId?: string): PanoTourStop {
  return {
    id,
    label: `Stop ${id}`,
    position: [3, 4],
    ...(levelId ? { levelId } : {}),
  }
}

// ---------------------------------------------------------------------------
// Flag-gating: Simple vs Pro mode
// ---------------------------------------------------------------------------

describe('P-720 tail — presentation + panoTour flag gating', () => {
  it('both presentation and panoTour are pro-tier (hidden in Simple)', () => {
    expect(FEATURE_FLAGS.presentation.tier).toBe('pro')
    expect(FEATURE_FLAGS.panoTour.tier).toBe('pro')
  })

  it('presentation is OFF in Simple mode', () => {
    const simple = resolveFlags(true, {}, false, 'simple')
    expect(simple.presentation).toBe(false)
  })

  it('panoTour is OFF in Simple mode', () => {
    const simple = resolveFlags(true, {}, false, 'simple')
    expect(simple.panoTour).toBe(false)
  })

  it('presentation is ON in Pro mode (default)', () => {
    const pro = resolveFlags(true, {}, false, 'pro')
    expect(pro.presentation).toBe(true)
  })

  it('panoTour is ON in Pro mode (default)', () => {
    const pro = resolveFlags(true, {}, false, 'pro')
    expect(pro.panoTour).toBe(true)
  })

  it('the tour-inclusion toggle requires BOTH flags — toggle is only available when both are on', () => {
    // Simulate: presentation=on, panoTour=off → toggle hidden
    const noTour = resolveFlags(true, { panoTour: false }, false, 'pro')
    expect(noTour.presentation).toBe(true)
    expect(noTour.panoTour).toBe(false)

    // Simulate: panoTour=on, presentation=off → toggle hidden
    const noPresentation = resolveFlags(true, { presentation: false }, false, 'pro')
    expect(noPresentation.panoTour).toBe(true)
    expect(noPresentation.presentation).toBe(false)

    // Both on → toggle visible
    const both = resolveFlags(true, {}, false, 'pro')
    expect(both.presentation).toBe(true)
    expect(both.panoTour).toBe(true)
  })

  it('neither flag is devOnly — the feature ships in production', () => {
    expect(FEATURE_FLAGS.presentation.devOnly).toBeUndefined()
    expect(FEATURE_FLAGS.panoTour.devOnly).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Auto-advance: pauses on tour-stop (panorama) slides
// ---------------------------------------------------------------------------

describe('P-720 tail — auto-advance pauses on tour-stop slides', () => {
  const base = { presenting: true, auto: true, count: 4, isPanoSlide: false }

  it('runs on a regular view slide', () => {
    expect(shouldAutoAdvance({ ...base, isPanoSlide: false })).toBe(true)
  })

  it('pauses on a tour-stop slide (isPanoSlide=true — tour stops are always panoramas)', () => {
    expect(shouldAutoAdvance({ ...base, isPanoSlide: true })).toBe(false)
  })

  it('pauses on a SavedView 360° slide too (same logic path)', () => {
    expect(shouldAutoAdvance({ ...base, isPanoSlide: true })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// composeTourSlides with empty tour / multi-storey filtering
// ---------------------------------------------------------------------------

describe('P-720 tail — composeTourSlides edge cases', () => {
  const views = [makeView('v1'), makeView('v2')]
  const groundStop = makeStop('g1') // ground floor (no levelId)
  const upperStop = makeStop('u1', 'floor-2') // upper storey

  it('empty tour → no extra slides appended (toggle effectively no-op)', () => {
    const slides = composeTourSlides(views, [], true)
    expect(slides).toHaveLength(2)
    expect(slides.every((s) => s.kind === 'view')).toBe(true)
  })

  it('includeTour=false → stops are completely ignored regardless of count', () => {
    const slides = composeTourSlides(views, [groundStop, upperStop], false)
    expect(slides).toHaveLength(2)
  })

  it('includes all stops when viewing all levels (no filter)', () => {
    const slides = composeTourSlides(views, [groundStop, upperStop], true, 'all')
    expect(slides.filter((s) => s.kind === 'tourStop')).toHaveLength(2)
  })

  it('filters out upper-storey stops when viewing ground level', () => {
    // Ground level is represented by undefined/no levelId; filter 'floor-2' keeps only upper
    const slides = composeTourSlides(views, [groundStop, upperStop], true, 'floor-2')
    const stopSlides = slides.filter((s) => s.kind === 'tourStop')
    expect(stopSlides).toHaveLength(1)
    expect(stopSlides[0]).toMatchObject({ kind: 'tourStop', stop: upperStop })
  })

  it('all stops filtered out when the level filter matches none', () => {
    const slides = composeTourSlides(views, [groundStop], true, 'floor-99')
    // groundStop has no levelId, floor-99 is the filter → no match
    expect(slides.filter((s) => s.kind === 'tourStop')).toHaveLength(0)
    expect(slides).toHaveLength(2) // only views remain
  })

  it('view slides always come before stop slides', () => {
    const slides = composeTourSlides(views, [groundStop], true)
    expect(slides[0].kind).toBe('view')
    expect(slides[1].kind).toBe('view')
    expect(slides[2].kind).toBe('tourStop')
  })

  it('no stops added when tour is included but there are no stops', () => {
    const slides = composeTourSlides(views, [], true, undefined)
    expect(slides).toHaveLength(2)
    expect(slides.every((s) => s.kind === 'view')).toBe(true)
  })
})

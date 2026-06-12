import { describe, expect, it } from 'vitest'
import type { SavedView } from '../../state/slices/cameraViewsSlice'
import type { PanoTourStop } from '../panorama/panoTour'
import { composeTourSlides, shouldAutoAdvance, wrapIndex } from './slideLogic'

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
    position: [1, 2],
    ...(levelId ? { levelId } : {}),
  }
}

// ---------------------------------------------------------------------------
// wrapIndex
// ---------------------------------------------------------------------------

describe('presentation slide logic', () => {
  describe('wrapIndex', () => {
    it('wraps forward past the end', () => {
      expect(wrapIndex(3, 3)).toBe(0)
      expect(wrapIndex(4, 3)).toBe(1)
    })
    it('wraps backward past the start', () => {
      expect(wrapIndex(-1, 3)).toBe(2)
    })
    it('passes in-range indices through', () => {
      expect(wrapIndex(1, 3)).toBe(1)
    })
    it('is safe on an empty deck', () => {
      expect(wrapIndex(5, 0)).toBe(0)
      expect(wrapIndex(-1, 0)).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // shouldAutoAdvance
  // ---------------------------------------------------------------------------

  describe('shouldAutoAdvance', () => {
    const base = { presenting: true, auto: true, count: 3, isPanoSlide: false }
    it('runs on a regular slide while presenting with auto on', () => {
      expect(shouldAutoAdvance(base)).toBe(true)
    })
    it('pauses on a 360° slide (interactive — advance on tap/next only)', () => {
      expect(shouldAutoAdvance({ ...base, isPanoSlide: true })).toBe(false)
    })
    it('pauses on a tour-stop panorama slide (same logic)', () => {
      // Tour-stop slides are always panorama slides — isPanoSlide is derived
      // from the slide kind in PresentationMode, so this tests the logic path.
      expect(shouldAutoAdvance({ ...base, isPanoSlide: true })).toBe(false)
    })
    it('never runs when not presenting / auto off / no slides', () => {
      expect(shouldAutoAdvance({ ...base, presenting: false })).toBe(false)
      expect(shouldAutoAdvance({ ...base, auto: false })).toBe(false)
      expect(shouldAutoAdvance({ ...base, count: 0 })).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // composeTourSlides
  // ---------------------------------------------------------------------------

  describe('composeTourSlides', () => {
    const v1 = makeView('v1')
    const v2 = makeView('v2', true) // pano view
    const s1 = makeStop('s1') // ground-floor stop
    const s2 = makeStop('s2') // ground-floor stop
    const sUpper = makeStop('su', 'upper-1') // upper-storey stop

    it('returns only view slides when includeTour is false', () => {
      const slides = composeTourSlides([v1, v2], [s1, s2], false)
      expect(slides).toHaveLength(2)
      expect(slides.every((s) => s.kind === 'view')).toBe(true)
    })

    it('returns only view slides when tour stops are empty (includeTour=true)', () => {
      const slides = composeTourSlides([v1, v2], [], true)
      expect(slides).toHaveLength(2)
      expect(slides.every((s) => s.kind === 'view')).toBe(true)
    })

    it('appends tour stops as tourStop slides after views when includeTour=true', () => {
      const slides = composeTourSlides([v1, v2], [s1, s2], true)
      expect(slides).toHaveLength(4)
      expect(slides[0]).toMatchObject({ kind: 'view', view: v1 })
      expect(slides[1]).toMatchObject({ kind: 'view', view: v2 })
      expect(slides[2]).toMatchObject({ kind: 'tourStop', stop: s1 })
      expect(slides[3]).toMatchObject({ kind: 'tourStop', stop: s2 })
    })

    it('views with no stops produce only view slides (empty tour)', () => {
      const slides = composeTourSlides([v1], [], true)
      expect(slides).toHaveLength(1)
      expect(slides[0].kind).toBe('view')
    })

    it('empty views + tour stops included gives only stop slides', () => {
      const slides = composeTourSlides([], [s1, s2], true)
      expect(slides).toHaveLength(2)
      expect(slides.every((s) => s.kind === 'tourStop')).toBe(true)
    })

    // -------------------------------------------------------------------------
    // Storey filtering
    // -------------------------------------------------------------------------

    it('includes all stops when no levelId filter is given (undefined)', () => {
      const slides = composeTourSlides([v1], [s1, sUpper], true, undefined)
      // 1 view + 2 stops (both included, no filter)
      expect(slides).toHaveLength(3)
      const stopSlides = slides.filter((s) => s.kind === 'tourStop')
      expect(stopSlides).toHaveLength(2)
    })

    it('includes all stops when filter is "all"', () => {
      const slides = composeTourSlides([v1], [s1, sUpper], true, 'all')
      expect(slides).toHaveLength(3)
    })

    it('filters to only upper-level stops when currentLevelId is an upper level id', () => {
      const slides = composeTourSlides([v1], [s1, sUpper], true, 'upper-1')
      // 1 view + 1 upper stop (ground s1 is skipped)
      expect(slides).toHaveLength(2)
      expect(slides[1]).toMatchObject({ kind: 'tourStop', stop: sUpper })
    })

    it('skips upper-level stops when the filter matches only ground level (no matching levelId)', () => {
      // Filter 'other-level' — neither s1 (ground, no levelId) nor sUpper ('upper-1')
      // matches, so only view slides remain.
      const slides = composeTourSlides([v1], [s1, sUpper], true, 'other-level')
      expect(slides).toHaveLength(1)
      expect(slides[0].kind).toBe('view')
    })

    it('multi-storey: each stop goes to the correct level bucket', () => {
      const sUpper2 = makeStop('su2', 'upper-2')
      const ground = composeTourSlides([v1], [s1, sUpper, sUpper2], true, 'upper-1')
      expect(ground.filter((s) => s.kind === 'tourStop')).toHaveLength(1)
      expect(ground[1]).toMatchObject({ kind: 'tourStop', stop: sUpper })
    })

    // -------------------------------------------------------------------------
    // Order invariant
    // -------------------------------------------------------------------------

    it('preserves the input order for both views and stops', () => {
      const v3 = makeView('v3')
      const s3 = makeStop('s3')
      const slides = composeTourSlides([v1, v3, v2], [s2, s3, s1], true)
      const viewIds = slides
        .filter((s) => s.kind === 'view')
        .map((s) => (s as { kind: 'view'; view: SavedView }).view.id)
      const stopIds = slides
        .filter((s) => s.kind === 'tourStop')
        .map((s) => (s as { kind: 'tourStop'; stop: PanoTourStop }).stop.id)
      expect(viewIds).toEqual(['v1', 'v3', 'v2'])
      expect(stopIds).toEqual(['s2', 's3', 's1'])
    })
  })
})

/**
 * Drawing-set callouts slice: free-text annotations that appear on specific
 * sheets of the construction drawing set (cover, floor plan, elevations,
 * lighting plan, etc.). Unlike plan notes (which are pinned to floor-plan
 * world coordinates), callouts are positioned relative to their target sheet
 * in normalised [0,1]×[0,1] coordinates so they survive plan rescaling and
 * different sheet sizes.
 *
 * Persists in the save schema (optional + additive, like `comments`) so
 * callouts travel with .sofa.json exports and share links.
 *
 * Data model follows the existing `DesignComment` / `MeasurementAnnotation`
 * patterns — one concern per slice, undo via `pushHistory`, reject bad input.
 */

import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** Which drawing-set sheet a callout targets.
 *  `'cover'` = cover/index sheet (A-0).
 *  `'floor-plan'` = the floor-plan sheet(s) (all storeys).
 *  `'elevations'` = wall elevation sheets.
 *  `'lighting'` = lighting plan + lux table.
 *  `'dimensions'` = dimensioned plan sheet(s).
 *  `'section'` = cross-section sheet.
 *  `'electrical'` = electrical plan sheet(s).
 *  `'plumbing'` = plumbing plan sheet(s).
 *  `'finishes'` = finishes schedule sheet.
 *  `'demolition'` = demolition plan sheet(s).
 *  `'ffe'` = FF&E schedule sheet.
 *  `'carpentry'` = carpentry elevation + section sheet(s) (TODO G8).
 *  A callout is rendered on all sheets whose name matches the target group;
 *  if that sheet group is layer-hidden, the callout is also omitted. */
export type CalloutSheet =
  | 'cover'
  | 'floor-plan'
  | 'elevations'
  | 'lighting'
  | 'dimensions'
  | 'section'
  | 'electrical'
  | 'plumbing'
  | 'finishes'
  | 'demolition'
  | 'ffe'
  | 'carpentry'

/** A free-text callout on a drawing-set sheet.
 *  `x`/`y` are normalised [0,1] within the sheet's drawing area (0,0 = top-left
 *  of the drawing canvas, 1,1 = bottom-right — not including the title block).
 *  Optional `leaderX`/`leaderY` define the tip of the leader line (also [0,1]);
 *  when absent, no leader line is drawn. */
export interface DrawingCallout {
  id: string
  /** The drawing-sheet group this callout appears on. */
  sheet: CalloutSheet
  /** Callout text (multi-line supported — newlines → SVG `<tspan>` rows). */
  text: string
  /** Normalised X position within the sheet drawing area [0, 1]. */
  x: number
  /** Normalised Y position within the sheet drawing area [0, 1]. */
  y: number
  /** Optional leader-line tip X [0, 1]. When set, a dashed line is drawn from
   *  the callout text anchor to this point. */
  leaderX?: number
  /** Optional leader-line tip Y [0, 1]. */
  leaderY?: number
}

export interface DrawingCalloutsSlice {
  /** All user-defined sheet callouts — persist with the design. */
  drawingCallouts: DrawingCallout[]
  /** Whether the Drawing callouts panel is open (session-only). */
  drawingCalloutsOpen: boolean
  setDrawingCalloutsOpen: (open: boolean) => void
  /** Add a callout. Rejects blank text or out-of-range positions. Returns the
   *  new id, or null on rejection. Pushes one undo step. */
  addDrawingCallout: (input: Omit<DrawingCallout, 'id'>) => string | null
  /** Update a callout's text (blank text is rejected). Pushes one undo step. */
  updateDrawingCalloutText: (id: string, text: string) => void
  /** Move a callout's anchor (and optional leader tip). Pushes one undo step. */
  moveDrawingCallout: (
    id: string,
    pos: { x: number; y: number; leaderX?: number; leaderY?: number },
  ) => void
  /** Remove a callout. Pushes one undo step. */
  deleteDrawingCallout: (id: string) => void
}

export const DRAWING_CALLOUTS_INITIAL: Pick<
  DrawingCalloutsSlice,
  'drawingCallouts' | 'drawingCalloutsOpen'
> = {
  drawingCallouts: [],
  drawingCalloutsOpen: false,
}

const calloutId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `dc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const inRange = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1

export const createDrawingCalloutsSlice: SliceCreator<DrawingCalloutsSlice, RootState> = (
  set,
  get,
) => ({
  ...DRAWING_CALLOUTS_INITIAL,

  setDrawingCalloutsOpen: (open) => set({ drawingCalloutsOpen: open }),

  addDrawingCallout: (input) => {
    const text = input.text.trim()
    if (!text || !inRange(input.x) || !inRange(input.y)) return null
    const hasLeader =
      input.leaderX !== undefined &&
      input.leaderY !== undefined &&
      inRange(input.leaderX) &&
      inRange(input.leaderY)
    const id = calloutId()
    get().pushHistory()
    set((s) => ({
      drawingCallouts: [
        ...s.drawingCallouts,
        {
          id,
          sheet: input.sheet,
          text,
          x: input.x,
          y: input.y,
          ...(hasLeader ? { leaderX: input.leaderX, leaderY: input.leaderY } : {}),
        },
      ],
    }))
    return id
  },

  updateDrawingCalloutText: (id, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const cur = get().drawingCallouts.find((c) => c.id === id)
    if (!cur || cur.text === trimmed) return
    get().pushHistory()
    set((s) => ({
      drawingCallouts: s.drawingCallouts.map((c) => (c.id === id ? { ...c, text: trimmed } : c)),
    }))
  },

  moveDrawingCallout: (id, pos) => {
    if (!inRange(pos.x) || !inRange(pos.y)) return
    const cur = get().drawingCallouts.find((c) => c.id === id)
    if (!cur) return
    get().pushHistory()
    set((s) => ({
      drawingCallouts: s.drawingCallouts.map((c) =>
        c.id === id
          ? {
              ...c,
              x: pos.x,
              y: pos.y,
              ...(pos.leaderX !== undefined && pos.leaderY !== undefined
                ? { leaderX: pos.leaderX, leaderY: pos.leaderY }
                : {}),
            }
          : c,
      ),
    }))
  },

  deleteDrawingCallout: (id) => {
    if (!get().drawingCallouts.some((c) => c.id === id)) return
    get().pushHistory()
    set((s) => ({ drawingCallouts: s.drawingCallouts.filter((c) => c.id !== id) }))
  },
})

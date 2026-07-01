/**
 * In-engine one-tap style transfer (no API key).
 *
 * A small library of named interior styles, each mapping to a whole-home floor
 * + wall finish (existing builtin procedural/CC0 finishes → prod-safe) and a
 * colour palette. Applying a style is a single logical action: swap every
 * room's floor/wall finish and set the master palette.
 *
 * This module is PURE (no React/store/three) — `STYLE_PRESETS` is data and
 * `planStyleApply` resolves a style id to the concrete values to apply, so the
 * mapping is unit-testable. The impure apply (store writes) lives in the UI.
 */

export interface StyleDef {
  /** Stable id (used as the apply key). */
  id: string
  /** Display name. */
  name: string
  /** One-line description of the look. */
  description: string
  /** Whole-home floor finish id (a builtin `floor-*` material). */
  floorFinishId: string
  /** Whole-home wall finish id (a builtin `wall-*` material). */
  wallFinishId: string
  /** Master colour palette (hex), up to 5 (the slice caps + sanitises). */
  palette: string[]
}

/** What `applyHomeStyle` + `setMasterPalette` need to apply a style. */
export interface StyleApplyPlan {
  floorFinishId: string
  wallFinishId: string
  palette: string[]
}

/**
 * Curated styles. Finish ids reference existing builtin finishes
 * (`src/materials/builtinCatalog.ts`) so a style is always renderable with no
 * downloads. Keep palettes ≤5 colours.
 */
export const STYLE_PRESETS: StyleDef[] = [
  {
    id: 'scandi',
    name: 'Scandinavian',
    description: 'Light ash floors, crisp white walls, airy neutrals.',
    floorFinishId: 'floor-wood-ash',
    wallFinishId: 'wall-paint-white',
    palette: ['#f5f1ea', '#e3dccf', '#c9bda8', '#8fa6ad', '#3f4a4d'],
  },
  {
    id: 'japandi',
    name: 'Japandi',
    description: 'Warm oak, greige walls, calm earthen tones.',
    floorFinishId: 'floor-wood-oak',
    wallFinishId: 'wall-paint-greige',
    palette: ['#efe9df', '#cdbfa6', '#9c8e76', '#6b6051', '#2f2a24'],
  },
  {
    id: 'industrial',
    name: 'Industrial',
    description: 'Bare concrete floors and walls, graphite + rust accents.',
    floorFinishId: 'floor-concrete',
    wallFinishId: 'wall-concrete-grey',
    palette: ['#d6d3ce', '#9a9690', '#5f5b57', '#2e2b28', '#b06a43'],
  },
  {
    id: 'coastal',
    name: 'Coastal',
    description: 'Pale maple floors, soft blue walls, sand + sea.',
    floorFinishId: 'floor-wood-maple',
    wallFinishId: 'wall-paint-blue',
    palette: ['#f6f4ee', '#dfe7ea', '#a9c6d2', '#5d8aa0', '#d8c7a3'],
  },
  {
    id: 'warm-minimal',
    name: 'Warm minimal',
    description: 'Teak floors, warm white walls, soft beiges.',
    floorFinishId: 'floor-wood-teak',
    wallFinishId: 'wall-paint-warm',
    palette: ['#f3ece1', '#e0d2bd', '#c2a988', '#8c7a63', '#4a4035'],
  },
]

/**
 * Resolve a style id to its concrete apply plan, or `null` if the id is unknown.
 * Pure — no side effects.
 */
export function planStyleApply(
  styleId: string,
  presets: StyleDef[] = STYLE_PRESETS,
): StyleApplyPlan | null {
  const style = presets.find((s) => s.id === styleId)
  if (!style) return null
  return {
    floorFinishId: style.floorFinishId,
    wallFinishId: style.wallFinishId,
    palette: style.palette,
  }
}

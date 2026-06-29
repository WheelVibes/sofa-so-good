/**
 * Pure state logic for the render-preset A/B compare modal (F4 tail).
 * Kept free of React + DOM so it can be unit-tested in Vitest.
 *
 * The modal holds:
 *   - `presetA` / `presetB` — the two preset IDs being compared
 *   - `divider`             — divider position as a fraction 0–1 (left → right)
 *
 * All mutations are pure functions returning the next state, making the logic
 * trivially testable without mounting a component.
 */

import { RENDER_PRESETS } from '../../scene/renderPresets'

export interface CompareState {
  /** ID of the left (A) render preset. */
  presetA: string
  /** ID of the right (B) render preset. */
  presetB: string
  /** Divider position as a fraction in [0, 1]. 0.5 = centre. */
  divider: number
  /** Whether a render is in progress for slot A. */
  renderingA: boolean
  /** Whether a render is in progress for slot B. */
  renderingB: boolean
  /** The captured PNG data-URL for slot A, or null if not yet rendered. */
  imageA: string | null
  /** The captured PNG data-URL for slot B, or null if not yet rendered. */
  imageB: string | null
  /** Sample counts for slot A (0 before render starts). */
  samplesA: number
  /** Sample counts for slot B (0 before render starts). */
  samplesB: number
  /** HDRI environment for slot A — a `hdriCatalog` id, or null = procedural (F4). */
  hdriA: string | null
  /** HDRI environment for slot B — a `hdriCatalog` id, or null = procedural (F4). */
  hdriB: string | null
}

export const DEFAULT_PRESET_A = RENDER_PRESETS[0]?.id ?? 'bright-day'
export const DEFAULT_PRESET_B = RENDER_PRESETS[1]?.id ?? 'soft-morning'

export function initialCompareState(): CompareState {
  return {
    presetA: DEFAULT_PRESET_A,
    presetB: DEFAULT_PRESET_B,
    divider: 0.5,
    renderingA: false,
    renderingB: false,
    imageA: null,
    imageB: null,
    samplesA: 0,
    samplesB: 0,
    hdriA: null,
    hdriB: null,
  }
}

/** Clamp divider to [0, 1] in increments the user can actually drag to.
 *  NaN → 0.5; ±Infinity → clamped to the appropriate bound. */
export function clampDivider(v: number): number {
  if (Number.isNaN(v)) return 0.5
  return Math.max(0, Math.min(1, v))
}

/** Swap the A/B presets and their rendered images (and sample counts). */
export function swapAB(s: CompareState): CompareState {
  return {
    ...s,
    presetA: s.presetB,
    presetB: s.presetA,
    imageA: s.imageB,
    imageB: s.imageA,
    samplesA: s.samplesB,
    samplesB: s.samplesA,
    renderingA: s.renderingB,
    renderingB: s.renderingA,
    hdriA: s.hdriB,
    hdriB: s.hdriA,
  }
}

/** Set preset A, clearing its rendered image so a re-render is needed. */
export function setPresetA(s: CompareState, id: string): CompareState {
  if (s.presetA === id) return s
  return { ...s, presetA: id, imageA: null, samplesA: 0, renderingA: false }
}

/** Set preset B, clearing its rendered image so a re-render is needed. */
export function setPresetB(s: CompareState, id: string): CompareState {
  if (s.presetB === id) return s
  return { ...s, presetB: id, imageB: null, samplesB: 0, renderingB: false }
}

/** Set slot A's HDRI environment (id or null = procedural), clearing its image. */
export function setHdriA(s: CompareState, hdriId: string | null): CompareState {
  if (s.hdriA === hdriId) return s
  return { ...s, hdriA: hdriId, imageA: null, samplesA: 0, renderingA: false }
}

/** Set slot B's HDRI environment (id or null = procedural), clearing its image. */
export function setHdriB(s: CompareState, hdriId: string | null): CompareState {
  if (s.hdriB === hdriId) return s
  return { ...s, hdriB: hdriId, imageB: null, samplesB: 0, renderingB: false }
}

/** Validate that a preset ID exists in the registry. */
export function isValidPresetId(id: string): boolean {
  return RENDER_PRESETS.some((p) => p.id === id)
}

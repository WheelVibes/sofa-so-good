/**
 * Context-aware tone-mapping default (RD-404). The user's stored "look" can be
 * an explicit operator (filmic / agx / neutral) OR `'auto'` — and when it's
 * `'auto'` the *right* operator depends on what the user is doing:
 *
 *  - **Finish / material preview** → Khronos PBR **Neutral**. Previewing a floor
 *    or wall swatch is a product-colour decision, so we want the truest albedo
 *    with minimal view-transform shift (no filmic contrast skewing the colour).
 *  - **Photo / render presets** → **AgX** (filmic). The "photo modes" want the
 *    photographic look, not catalogue-accurate flatness.
 *  - **Otherwise** → the historical default (filmic), so the everyday scene is
 *    unchanged.
 *
 * An *explicit* user pick always wins — context only drives the `'auto'`
 * default. Pure (no three.js, no React) so the rule is unit-testable; the
 * renderer maps the resolved {@link ToneMappingMode} to a three constant via
 * `toneMappingThree.ts`.
 */

import { DEFAULT_TONE_MAPPING, type ToneMappingMode } from './look'

/** What the user has selected for the tone-mapping "look": a concrete operator,
 *  or `'auto'` to let the context pick one. */
export type ToneMappingSetting = ToneMappingMode | 'auto'

/** The default user setting — `'auto'` so a fresh user gets the context-aware
 *  behaviour (Neutral while previewing finishes, filmic otherwise). */
export const DEFAULT_TONE_MAPPING_SETTING: ToneMappingSetting = 'auto'

/** All user-selectable settings, with `'auto'` first (the recommended default). */
export const TONE_MAPPING_SETTINGS: ToneMappingSetting[] = ['auto', 'filmic', 'agx', 'neutral']

/** Signals that drive the `'auto'` choice. Kept boolean + minimal so the React
 *  wiring is a thin projection of store state. */
export interface ToneContext {
  /** The user is actively previewing finishes/materials (FinishPicker open). */
  finishPreview: boolean
  /** A photo/render-preset or HQ-render context wants the filmic look. */
  photoMode: boolean
}

/** The tone-mapper `'auto'` resolves to when previewing finishes/materials. */
export const AUTO_FINISH_PREVIEW_MODE: ToneMappingMode = 'neutral'
/** The tone-mapper `'auto'` resolves to for photo/render presets. */
export const AUTO_PHOTO_MODE: ToneMappingMode = 'agx'

/** A type guard so callers can tell an explicit pick from `'auto'`. */
export function isAuto(setting: ToneMappingSetting): setting is 'auto' {
  return setting === 'auto'
}

/**
 * Build the {@link ToneContext} from the store fields that imply it, so the
 * renderer's per-frame wiring is a thin (testable) projection. The FinishPicker
 * is open — i.e. the user is judging a surface finish — whenever a room **or a
 * wall** is selected (both preview a floor/wall finish), so either pins Neutral
 * for accurate product colour. `photoMode` stays off: the only photographic
 * context (the HQ-render modal) renders in its own surface, not the live canvas.
 */
export function toneContextFromState(s: {
  selectedRoomId: string | null
  selectedWall: { wallId: string; roomId: string } | null
}): ToneContext {
  return {
    finishPreview: s.selectedRoomId != null || s.selectedWall != null,
    photoMode: false,
  }
}

/**
 * Resolve the user's stored setting + the current context into the concrete
 * operator the renderer should apply.
 *
 * An explicit pick is returned verbatim (override wins). `'auto'` picks Neutral
 * while previewing finishes, AgX for photo mode, else the historical default.
 * Finish-preview takes priority over photo mode — if a user opens the finish
 * picker we assume they're judging colour even mid-preset.
 */
export function resolveToneMapping(
  setting: ToneMappingSetting,
  context: ToneContext,
): ToneMappingMode {
  if (!isAuto(setting)) return setting
  if (context.finishPreview) return AUTO_FINISH_PREVIEW_MODE
  if (context.photoMode) return AUTO_PHOTO_MODE
  return DEFAULT_TONE_MAPPING
}

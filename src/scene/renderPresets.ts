/**
 * One-tap render presets (F4) — curated sun + tone-mapping + exposure +
 * fixture-light combinations, the "photo modes" competitors ship (Coohom's
 * render moods, Planner 5D's lighting presets). Pure data + one applier so
 * the Scene menu, the mobile sheet and tests share a single source of truth.
 */

import type { TimePreset } from '../state/slices/timeSlice'
import type { LightsMode } from '../state/slices/uiSlice'
import type { ToneMappingMode } from './look'

export interface RenderPreset {
  id: string
  label: string
  /** One-line description shown as the menu sub-label. */
  sub: string
  time: TimePreset
  toneMapping: ToneMappingMode
  /** User exposure multiplier (clamped by the slice on apply). */
  exposure: number
  lights: LightsMode
}

/** The actions a preset drives (a structural slice of the store). */
export interface RenderPresetActions {
  setPresetTime: (p: TimePreset) => void
  setToneMapping: (m: ToneMappingMode) => void
  setExposure: (e: number) => void
  setLightsMode: (m: LightsMode) => void
}

export const RENDER_PRESETS: RenderPreset[] = [
  {
    id: 'bright-day',
    label: 'Bright day',
    sub: 'Noon sun, clean neutral tone',
    time: 'noon',
    toneMapping: 'neutral',
    exposure: 1.1,
    lights: 'off',
  },
  {
    id: 'soft-morning',
    label: 'Soft morning',
    sub: 'Gentle AgX morning light',
    time: 'morning',
    toneMapping: 'agx',
    exposure: 1.05,
    lights: 'off',
  },
  {
    id: 'golden-hour',
    label: 'Golden hour',
    sub: 'Warm dusk, filmic contrast',
    time: 'dusk',
    toneMapping: 'filmic',
    exposure: 1,
    lights: 'on',
  },
  {
    id: 'cozy-evening',
    label: 'Cozy evening',
    sub: 'Night with warm fixtures on',
    time: 'night',
    toneMapping: 'filmic',
    exposure: 0.95,
    lights: 'on',
  },
]

/** Apply a preset's four levers in one tap. */
export function applyRenderPreset(actions: RenderPresetActions, preset: RenderPreset): void {
  actions.setPresetTime(preset.time)
  actions.setToneMapping(preset.toneMapping)
  actions.setExposure(preset.exposure)
  actions.setLightsMode(preset.lights)
}

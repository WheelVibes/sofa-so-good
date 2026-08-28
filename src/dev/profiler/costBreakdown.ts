import type { QualitySettings } from '../../scene/quality'
import type { LightsMode } from '../../state/slices/uiSlice'
import type { EffectCost } from './profilerTypes'

/** Store-level render inputs a sweep step can switch off. Not every expensive
 *  thing is a quality PRESET setting — fixture lights are a user switch — and
 *  the sweep has to be able to measure those too, or they stay invisible in the
 *  one report anyone actually looks at. */
export interface SweepStorePatch {
  lightsMode?: LightsMode
}

export interface SweepStep {
  /** Stable key for the report row. */
  key: string
  label: string
  /** Disable by forcing a quality-preset override to this value… */
  quality?: {
    key: keyof QualitySettings
    /** The value to force the setting to in order to DISABLE the effect. */
    value: QualitySettings[keyof QualitySettings]
  }
  /** …or by patching the store (for render inputs that aren't preset settings).
   *  A step whose patch already matches live state is skipped by the engine —
   *  a guaranteed-zero row is noise, not data. */
  store?: SweepStorePatch
}

/** Heavy render effects, toggled one at a time and ranked by measured cost. */
export const COST_SWEEP: SweepStep[] = [
  {
    key: 'postprocessing',
    label: 'Post-processing (bloom/AO/SMAA)',
    quality: { key: 'postprocessing', value: false },
  },
  { key: 'shadowMapSize', label: 'Sun shadows', quality: { key: 'shadowMapSize', value: 0 } },
  { key: 'ibl', label: 'IBL reflections', quality: { key: 'ibl', value: false } },
  { key: 'dof', label: 'Depth of field', quality: { key: 'dof', value: false } },
  {
    key: 'contactShadows',
    label: 'Contact shadows',
    quality: { key: 'contactShadows', value: false },
  },
  {
    key: 'geometryDetail',
    label: 'Geometry detail',
    quality: { key: 'geometryDetail', value: 0.5 },
  },
  { key: 'dprMax', label: 'Pixel ratio (DPR)', quality: { key: 'dprMax', value: 1 } },
  // Fixture lights multiply FILL cost: three unrolls the point-light loop and
  // `RE_Direct_Physical` runs the full BRDF per light per fragment with no
  // early-out on an attenuated-to-zero light, so N lights ≈ N× the lighting
  // maths on every lit fragment on screen. Measured by switching them off, so
  // the row reads 0 in a scene where they're already off (the engine skips it).
  { key: 'fixtureLights', label: 'Fixture lights', store: { lightsMode: 'off' } },
]

export type MeasureFn = (step?: SweepStep) => Promise<number>

/**
 * Measure a baseline average frame time, then for each step measure with just
 * that effect disabled, and rank the effects by how much frame time they cost
 * (largest saving first). All live state handling (applying/restoring the
 * override, driving frames) lives in `measure`; this function is pure
 * orchestration + arithmetic so it is deterministically testable.
 */
export async function runSweep(
  steps: SweepStep[],
  measure: MeasureFn,
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<EffectCost[]> {
  const baselineMs = await measure()
  const out: EffectCost[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const disabledMs = await measure(step)
    const deltaMs = baselineMs - disabledMs
    const fpsGain = 1000 / disabledMs - 1000 / baselineMs
    out.push({ key: step.key, label: step.label, baselineMs, disabledMs, deltaMs, fpsGain })
    onProgress?.(i + 1, steps.length, step.label)
  }
  return out.sort((a, b) => b.deltaMs - a.deltaMs)
}

import type { QualitySettings } from '../../scene/quality'
import type { EffectCost } from './profilerTypes'

export interface SweepStep {
  key: keyof QualitySettings
  label: string
  /** The value to force the setting to in order to DISABLE the effect. */
  disabledValue: QualitySettings[keyof QualitySettings]
}

/** Heavy render effects, toggled one at a time and ranked by measured cost. */
export const COST_SWEEP: SweepStep[] = [
  { key: 'postprocessing', label: 'Post-processing (bloom/AO/SMAA)', disabledValue: false },
  { key: 'shadowMapSize', label: 'Sun shadows', disabledValue: 0 },
  { key: 'ibl', label: 'IBL reflections', disabledValue: false },
  { key: 'dof', label: 'Depth of field', disabledValue: false },
  { key: 'contactShadows', label: 'Contact shadows', disabledValue: false },
  { key: 'cornerAo', label: 'Corner AO', disabledValue: false },
  { key: 'maxFixtureLights', label: 'Fixture lights', disabledValue: 0 },
  { key: 'geometryDetail', label: 'Geometry detail', disabledValue: 0.5 },
  { key: 'dprMax', label: 'Pixel ratio (DPR)', disabledValue: 1 },
]

export type MeasureFn = (override?: {
  key: keyof QualitySettings
  value: QualitySettings[keyof QualitySettings]
}) => Promise<number>

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
    const disabledMs = await measure({ key: step.key, value: step.disabledValue })
    const deltaMs = baselineMs - disabledMs
    const fpsGain = 1000 / disabledMs - 1000 / baselineMs
    out.push({ key: String(step.key), label: step.label, baselineMs, disabledMs, deltaMs, fpsGain })
    onProgress?.(i + 1, steps.length, step.label)
  }
  return out.sort((a, b) => b.deltaMs - a.deltaMs)
}

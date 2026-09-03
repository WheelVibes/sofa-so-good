/**
 * Persists the user's graphics preferences (quality tier + per-setting
 * overrides) to localStorage so they survive reloads. Kept separate from the
 * layout save format — quality is a per-device preference, not part of a
 * saved design.
 */

import {
  clampFocalMm,
  clampFocusDistance,
  clampFStop,
  FOCAL_DEFAULT_MM,
  FOCUS_DEFAULT_M,
  FSTOP_DEFAULT,
} from '../../scene/cameras/cameraLensSettings'
import {
  clampExposure,
  clampSceneSaturation,
  clampSceneWarmth,
  DEFAULT_EXPOSURE,
  DEFAULT_SCENE_SATURATION,
  DEFAULT_SCENE_WARMTH,
} from '../../scene/look'
import { DEVICE_CLASSES, type DeviceClass, type RenderTier } from '../../scene/quality'
import {
  DEFAULT_TONE_MAPPING_SETTING,
  TONE_MAPPING_SETTINGS,
  type ToneMappingSetting,
} from '../../scene/toneContext'
import { useStore } from '../store'

const KEY = 'sofa.graphics.v1'

export function loadQualityPrefs(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return
    const p = JSON.parse(raw) as {
      // Legacy prefs (≤ v1 tiers) used 'low' for the flat tier; migrate it.
      tier?: string
      overrides?: Record<string, unknown>
      userSet?: boolean
      assetTier?: 'low' | 'medium' | 'high' | null
      autoMaxDevice?: 'weak' | 'capable' | null
      autoSettled?: boolean
      toneMapping?: string
      exposure?: number
      sceneWarmth?: number
      sceneSaturation?: number
      lensFocalMm?: number
      dofFStop?: number
      dofFocusDistance?: number
      dofAuto?: boolean
      verticalLock?: boolean
      parallelProjection?: boolean
    }
    // Map every tier name this app has ever persisted onto the two modes.
    //
    // This is not a deprecation shim — the old modes are gone from the code
    // entirely. It is input validation on data already sitting in browsers: a
    // returning user's stored `'maximum'` has to land somewhere, and dropping it
    // to the default would silently reset a preference they set deliberately.
    // The mapping follows the parity pairing in `quality.ts`: the old High and
    // Maximum are the two variants of `realistic`, and the old flat and Medium
    // are the two variants of `performance`, so nobody's picture changes.
    const LEGACY_TIERS: Record<string, RenderTier> = {
      low: 'performance',
      performance: 'performance',
      medium: 'performance',
      high: 'realistic',
      maximum: 'realistic',
      realistic: 'realistic',
    }
    const tier: RenderTier = LEGACY_TIERS[p.tier ?? ''] ?? 'performance'
    // Only accept a known tone-mapping setting (back-compat: absent → default
    // 'auto'; a legacy 'filmic'/'agx'/'neutral' is a valid setting and is kept
    // as an explicit user pick).
    const toneMapping: ToneMappingSetting = TONE_MAPPING_SETTINGS.includes(
      p.toneMapping as ToneMappingSetting,
    )
      ? (p.toneMapping as ToneMappingSetting)
      : DEFAULT_TONE_MAPPING_SETTING
    useStore.setState({
      qualityTier: tier,
      qualityOverrides: (p.overrides as never) ?? {},
      // If they'd customised before, keep auto-adjust off so we honour it.
      qualityUserSet: !!p.userSet,
      // TIER-ADAPTIVE: the learned ceiling (the device class that FAILED here).
      // A legacy value named a retired tier, which says nothing about the new
      // axis, so it is discarded rather than guessed at — the ladder simply
      // re-probes, which is what it is for.
      autoMaxDevice: DEVICE_CLASSES.includes(p.autoMaxDevice as DeviceClass)
        ? (p.autoMaxDevice as DeviceClass)
        : null,
      // A restored tier is a SETTLED tier — the adaptive ladder already ran on
      // this device. `QualityController` reads this to skip its one-time
      // capability boot pick, which would otherwise stomp the settled value back
      // to the conservative first-visit tier on every reload (so a device that
      // had earned High would restart at Medium and re-probe, every visit).
      qualityAutoSettled: true,
      // null = Auto (follow the render tier).
      assetTier: p.assetTier ?? null,
      toneMapping,
      exposure: typeof p.exposure === 'number' ? clampExposure(p.exposure) : DEFAULT_EXPOSURE,
      // Scene colour-grade dials (COLOR-GRADE) — back-compat neutral defaults.
      sceneWarmth:
        typeof p.sceneWarmth === 'number' ? clampSceneWarmth(p.sceneWarmth) : DEFAULT_SCENE_WARMTH,
      sceneSaturation:
        typeof p.sceneSaturation === 'number'
          ? clampSceneSaturation(p.sceneSaturation)
          : DEFAULT_SCENE_SATURATION,
      // Lens + DoF (PC2-CAM-DOF-LENS) — back-compat defaults for legacy prefs.
      lensFocalMm:
        typeof p.lensFocalMm === 'number' ? clampFocalMm(p.lensFocalMm) : FOCAL_DEFAULT_MM,
      dofFStop: typeof p.dofFStop === 'number' ? clampFStop(p.dofFStop) : FSTOP_DEFAULT,
      dofFocusDistance:
        typeof p.dofFocusDistance === 'number'
          ? clampFocusDistance(p.dofFocusDistance)
          : FOCUS_DEFAULT_M,
      dofAuto: typeof p.dofAuto === 'boolean' ? p.dofAuto : true,
      // Two-point-perspective / vertical-line-lock (FEAT-D) — back-compat
      // default off (normal perspective) for legacy prefs.
      verticalLock: typeof p.verticalLock === 'boolean' ? p.verticalLock : false,
      // Parallel-projection / orthographic dollhouse (R3-FEAT-3) — back-compat
      // default off (normal perspective) for legacy prefs.
      parallelProjection: typeof p.parallelProjection === 'boolean' ? p.parallelProjection : false,
    })
  } catch {
    /* ignore corrupt prefs */
  }
}

export function watchQualityPrefs(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify({
      tier: s.qualityTier,
      overrides: s.qualityOverrides,
      userSet: s.qualityUserSet,
      assetTier: s.assetTier,
      autoMaxDevice: s.autoMaxDevice,
      toneMapping: s.toneMapping,
      exposure: s.exposure,
      sceneWarmth: s.sceneWarmth,
      sceneSaturation: s.sceneSaturation,
      lensFocalMm: s.lensFocalMm,
      dofFStop: s.dofFStop,
      dofFocusDistance: s.dofFocusDistance,
      dofAuto: s.dofAuto,
      verticalLock: s.verticalLock,
      parallelProjection: s.parallelProjection,
    })
    if (snap === last) return
    last = snap
    try {
      localStorage.setItem(KEY, snap)
    } catch {
      /* storage full / unavailable */
    }
  })
}

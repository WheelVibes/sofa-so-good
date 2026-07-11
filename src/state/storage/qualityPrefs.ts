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
import { clampExposure, DEFAULT_EXPOSURE } from '../../scene/look'
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
      tier?: 'low' | 'performance' | 'medium' | 'high' | 'maximum'
      overrides?: Record<string, unknown>
      userSet?: boolean
      assetTier?: 'low' | 'medium' | 'high' | null
      toneMapping?: string
      exposure?: number
      lensFocalMm?: number
      dofFStop?: number
      dofFocusDistance?: number
      dofAuto?: boolean
      verticalLock?: boolean
      parallelProjection?: boolean
    }
    // Migrate the old flat tier name. Other names map 1:1 onto the new
    // RenderTier union (medium/high unchanged; maximum is new).
    const tier = p.tier === 'low' ? 'performance' : (p.tier ?? 'performance')
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
      // null = Auto (follow the render tier).
      assetTier: p.assetTier ?? null,
      toneMapping,
      exposure: typeof p.exposure === 'number' ? clampExposure(p.exposure) : DEFAULT_EXPOSURE,
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
      toneMapping: s.toneMapping,
      exposure: s.exposure,
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

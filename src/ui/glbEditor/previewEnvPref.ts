/**
 * GLB Asset Designer — Stage 8a preview-environment preference (per-device UI
 * pref, like the grid-snap pref + catalog width — NOT part of the design save
 * schema). Persists which lighting the viewport previews finishes under so the
 * choice survives reloads.
 *
 *  - `studio` — the fixed 3-light rig (ambient + hemisphere + key). The default;
 *    byte-identical to the pre-Stage-8a viewport.
 *  - `room` — the app's procedural Lightformer image-based-lighting probe (the
 *    same reflections/bounce the real scene renders under), so physical finishes
 *    (sheen / clearcoat / transmission / anisotropy) can be judged under lighting
 *    that matches the placed look.
 */

const KEY = 'hdb_designer_preview_env'

export type PreviewEnv = 'studio' | 'room'

/** The offered preview environments (declaration order = UI order). */
export const PREVIEW_ENVS = ['studio', 'room'] as const

export const PREVIEW_ENV_LABEL: Record<PreviewEnv, string> = {
  studio: 'Studio',
  room: 'Room',
}

export const DEFAULT_PREVIEW_ENV: PreviewEnv = 'studio'

export function isPreviewEnv(v: string): v is PreviewEnv {
  return (PREVIEW_ENVS as readonly string[]).includes(v)
}

/** Load the persisted preference (defaults on load failure / absent / garbage). */
export function loadPreviewEnv(): PreviewEnv {
  if (typeof localStorage === 'undefined') return DEFAULT_PREVIEW_ENV
  try {
    const raw = localStorage.getItem(KEY)
    return raw !== null && isPreviewEnv(raw) ? raw : DEFAULT_PREVIEW_ENV
  } catch {
    return DEFAULT_PREVIEW_ENV
  }
}

/** Persist the preference (best-effort — private mode / quota is non-fatal). */
export function savePreviewEnv(env: PreviewEnv): void {
  try {
    localStorage.setItem(KEY, env)
  } catch {
    /* private mode / quota — the pref still applies for this session */
  }
}

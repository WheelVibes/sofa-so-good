/**
 * HQ-render environment selection (PHOTO-HDRI-PT) — pure helpers deciding what
 * lights the path-traced still. When the user has a CC0 HDRI active
 * (`hdriEnvironment` flag + a selected `hdriId`), the tracer should be lit by
 * that same captured equirect environment (importance-sampled by
 * three-gpu-pathtracer) instead of the neutral 2-colour gradient fallback.
 * Kept free of any GPU/session state so the logic is unit-testable in node.
 */

import { EquirectangularReflectionMapping, type Texture } from 'three'
import { hdriById } from '../lighting/hdriCatalog'

/** The equirect `.hdr` URL the HQ still should be lit with, or `null` for the
 *  gradient fallback (flag off / no selection / unknown id → procedural mode). */
export function hqEnvironmentUrl(
  hdriOn: boolean,
  hdriId: string | null | undefined,
): string | null {
  if (!hdriOn) return null
  return hdriById(hdriId)?.url ?? null
}

/**
 * Whether a live `scene.environment` texture can be fed to the path tracer
 * directly: a plain equirect texture with CPU-readable image data (the drei
 * `<Environment files>` RGBELoader result). The procedural Lightformer probe is
 * a cube render-target texture — the tracer's converter can't read it back, so
 * it must NOT pass (the session loads the `.hdr` itself instead).
 */
export function isReusableEquirectEnvironment(tex: unknown): tex is Texture {
  const t = tex as {
    isTexture?: boolean
    isRenderTargetTexture?: boolean
    mapping?: number
    image?: unknown
  } | null
  return Boolean(
    t?.isTexture &&
      !t.isRenderTargetTexture &&
      t.mapping === EquirectangularReflectionMapping &&
      t.image,
  )
}

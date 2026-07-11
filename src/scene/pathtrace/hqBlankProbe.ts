/**
 * PT-BLANK-GUARD — blank-frame detection for the HQ path-traced render.
 *
 * On some drivers (e.g. WSL D3D12/ANGLE) three-gpu-pathtracer's megakernel
 * ShaderMaterial fails GLSL validation ("Shader Error 1282", empty info log):
 * every `renderSample` silently no-ops, the sample counter races to "done",
 * and the output is uniformly blank — black with the plain blit, white with
 * the denoise blit. The session probes a sparse grid of canvas pixels once,
 * right after the first sample completes, and classifies them here.
 *
 * Pure + dependency-free (node-environment unit-tested); the GL readback that
 * feeds it lives in `hqRenderSession.ts`.
 */

export type HqProbeVerdict = 'blank' | 'ok'

/**
 * Classify a probe readback (RGBA byte quadruplets, alpha ignored): `blank`
 * when EVERY sampled RGB byte is 0, or EVERY sampled RGB byte is 255 — the
 * two uniform-extreme signatures of a failed megakernel. Anything with a
 * single non-extreme channel — any real render, even 1-sample noise over the
 * gradient sky / HDRI background — is `ok`. An empty buffer (failed or
 * skipped readback) is `ok`: the probe must never abort a session on missing
 * evidence.
 */
export function classifyProbePixels(px: ArrayLike<number>): HqProbeVerdict {
  const pixels = Math.floor(px.length / 4)
  if (pixels === 0) return 'ok'
  let all0 = true
  let all255 = true
  for (let i = 0; i < pixels; i++) {
    for (let c = 0; c < 3; c++) {
      const v = px[i * 4 + c]
      if (v !== 0) all0 = false
      if (v !== 255) all255 = false
    }
    if (!all0 && !all255) return 'ok'
  }
  return 'blank'
}

const BLANK_MARKER = 'hqBlankRender'

/** Error the session aborts with when the first-sample probe reads blank. */
export class HqBlankRenderError extends Error {
  readonly [BLANK_MARKER] = true
  constructor() {
    super(
      'HQ render produced a uniformly blank frame — the graphics driver likely ' +
        'failed to compile the path-tracing shader',
    )
    this.name = 'HqBlankRenderError'
  }
}

/** Narrow an `onError` payload to the blank-render abort (survives dynamic-import
 *  module duplication by checking the marker, not `instanceof`). */
export function isHqBlankRenderError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as Record<string, unknown>)[BLANK_MARKER] === true
  )
}

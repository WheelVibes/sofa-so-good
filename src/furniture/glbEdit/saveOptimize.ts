import { runOptimize } from '../optimize/runOptimize'

/**
 * Hard ceiling on how long the save-time optimize pass may run before we give up
 * and persist the RAW export instead (Stage 7a · AS-OPT-GUARD).
 *
 * `runOptimize` is *supposed* to be best-effort (never throw — it returns the
 * input on any failure), but its Draco/Basis WASM stack can genuinely HANG on a
 * misconfigured host: in the dev harness a wrong `.wasm` MIME type made the
 * Draco-encoder module never resolve, so the `await runOptimize(raw)` promise
 * never settled and the whole save wedged (seen in `glb-designer-stage6b`,
 * 2026-07-16). Prod serves wasm with the right MIME, but a save that can hang on
 * *any* wasm/network hiccup contradicts the shrink-or-no-op contract. 20 s is far
 * beyond a legitimate optimize of designer-scale geometry yet short enough that a
 * stuck save recovers on its own.
 *
 * **Worker-leak note.** This race has no job-cancel API of its own: on timeout the
 * in-flight worker call is simply abandoned (its `pending` resolver is dropped when
 * we `race` past it). Two backstops keep that from leaking a pool slot: if the
 * worker eventually finishes, it returns to idle and is REUSED for the next job (or
 * torn down after `runOptimize`'s 30 s idle-teardown); if it is genuinely HUNG and
 * never answers, `runOptimize`'s per-job watchdog ({@link
 * import('../optimize/runOptimize').JOB_TIMEOUT_MS}, 30 s — set just above this
 * 20 s race so we lose it first) terminates the worker, rejects its pending jobs
 * (harmless here — we already returned the raw GLB), and drops it so a fresh worker
 * respawns on demand. A leaked *idle* worker is bounded (`POOL_MAX`); a hung one is
 * now reclaimed rather than held for the tab's lifetime.
 */
export const OPTIMIZE_SAVE_TIMEOUT_MS = 20_000

/** Unique sentinel resolved by the timeout arm of the race — distinguishable
 *  from any real `RunOptimizeResult`, so a slow-but-eventual optimize can't be
 *  confused with a timeout. */
const TIMED_OUT = Symbol('optimize-timeout')

export interface SaveOptimizeResult {
  /** The bytes to persist — the optimized GLB when it's smaller, else the raw. */
  data: Uint8Array
  beforeBytes: number
  afterBytes: number
  /** True when the optimized output was adopted (was strictly smaller). */
  optimized: boolean
}

/**
 * Route an exported designer GLB through the shared optimize pipeline
 * (`optimize/runOptimize` → weld/dedup/prune + Draco geometry pack + near-lossless
 * WebP texture re-encode, off the main thread) before persist — Asset Studio
 * Stage 6f.
 *
 * **Feature-safe**: the pass preserves every material feature the designer bakes —
 * KHR physical-material extensions (sheen/clearcoat/transmission/anisotropy),
 * multi-material primitives (Stage 6c per-face boxes), vertex-colour gradients
 * (Stage 2 COLOR_0), and embedded normal maps (Stage 6e wrinkles / decal
 * textures). Verified by `saveOptimize.test.ts` (the extension-registration fix
 * in `optimizeGlb.ts` is what makes the physical extensions survive the
 * gltf-transform read/write).
 *
 * **Keep-smaller guard**: procedural designer geometry is often tiny, where
 * Draco's per-primitive header overhead can make the packed GLB *larger* than the
 * raw export. So we adopt the optimized bytes ONLY when they're strictly smaller;
 * otherwise the raw export is persisted unchanged. The real win is the WebP
 * texture re-encode on assets carrying `mat:<id>` finishes / decal / wrinkle maps
 * (~50–70% of a textured asset's bytes). `runOptimize` never throws (best-effort);
 * on any failure it returns the input, so this can only ever shrink or no-op.
 *
 * **Fail-soft (Stage 7a · AS-OPT-GUARD).** The optimize call is additionally
 * bounded by {@link OPTIMIZE_SAVE_TIMEOUT_MS}: on timeout OR any rejection we log
 * a `console.warn` and persist the RAW GLB unchanged, so a hung/failed WASM stack
 * can never wedge the save — the shrink-or-no-op contract holds even in the
 * degenerate case.
 */
export async function optimizeSavedGlb(raw: Uint8Array): Promise<SaveOptimizeResult> {
  const beforeBytes = raw.byteLength
  const rawResult: SaveOptimizeResult = {
    data: raw,
    beforeBytes,
    afterBytes: beforeBytes,
    optimized: false,
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), OPTIMIZE_SAVE_TIMEOUT_MS)
    })
    const outcome = await Promise.race([runOptimize(raw), timeout])
    if (outcome === TIMED_OUT) {
      // eslint-disable-next-line no-console
      console.warn(
        `[saveOptimize] optimize pass exceeded ${OPTIMIZE_SAVE_TIMEOUT_MS}ms — persisting raw GLB (${beforeBytes}B). The abandoned worker job returns to the idle pool and is reused.`,
      )
      return rawResult
    }
    const { data } = outcome
    if (data.byteLength < beforeBytes) {
      return { data, beforeBytes, afterBytes: data.byteLength, optimized: true }
    }
    return rawResult
  } catch (err) {
    // runOptimize is meant to be best-effort, but guard against any unexpected
    // rejection too — persist the raw export rather than fail the save.
    // eslint-disable-next-line no-console
    console.warn('[saveOptimize] optimize pass rejected — persisting raw GLB:', err)
    return rawResult
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * The app's single renderer-bound `KTX2Loader`.
 *
 * **Why this module exists rather than a boot-time registration.** `src/furniture/gltf/decoders.ts`
 * registers Draco at boot because drei exposes a global setter for it. KTX2 has no such hook, and
 * could not use one anyway: `KTX2Loader.detectSupport( renderer )` reads the *live* WebGL context's
 * compressed-texture extensions (`WEBGL_compressed_texture_astc`, `…_etc`, `…_s3tc`,
 * `EXT_texture_compression_bptc`, …) to choose which GPU format the Basis transcoder should emit,
 * and `load()`/`parse()` **throw** — `'THREE.KTX2Loader: Missing initialization with
 * `.detectSupport( renderer )`'` — while `workerConfig` is still `null`
 * (three r184, `examples/jsm/loaders/KTX2Loader.js` lines 361 and 393). So the binding has to happen
 * inside the R3F tree, where a renderer exists. That is exactly the shape
 * `AnisotropyController.tsx` already uses for `getMaxAnisotropy()`, and `Ktx2Controller.tsx` is its
 * sibling.
 *
 * **One loader, not one per call site.** three warns `'Multiple active KTX2 loaders may cause
 * performance issues'` (same file, line ~336) because each instance downloads its own copy of the
 * transcoder and allocates its own worker pool. The GLB path (drei `useGLTF` via
 * {@link file://../furniture/gltf/loaderSecurity.ts}) and the lightmap path
 * ({@link file://./VisibilityLightmaps.tsx}) therefore share this singleton.
 *
 * **Context loss.** `detectSupport()` only writes `this.workerConfig`; that object is captured into
 * each transcode worker at worker-creation time (`worker.postMessage({ type: 'init', config: … })`),
 * so a *changed* config cannot reach workers that already exist. A restored context on the same
 * device reports the same extensions in practice, so the common case is a no-op re-detect. When the
 * set genuinely differs we replace the loader outright rather than re-detecting in place: three's
 * `dispose()` revokes `workerSourceURL` but leaves `transcoderPending` set, so a disposed instance
 * can never rebuild its own workers — reusing one would produce a loader whose workers all fail to
 * spawn.
 *
 * API facts verified against three r184 docs + source (2026-09-25):
 * - `new KTX2Loader( manager? )`
 * - `.setTranscoderPath( path: string ): this` — default `examples/jsm/libs/basis/`
 * - `.detectSupport( renderer: WebGLRenderer | WebGPURenderer ): this` — must precede any load
 * - `.setWorkerLimit( n: number ): this`
 * - `.load( url, onLoad, onProgress, onError )` / `.parse( buffer, onLoad, onError )`
 * - `.dispose()`
 * (https://threejs.org/docs/pages/KTX2Loader.html)
 */
import type { WebGLRenderer } from 'three'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { withBase } from '../utils/assetUrl'

/**
 * Self-hosted Basis transcoder (`basis_transcoder.js` + `.wasm`), byte-identical to the pair
 * shipped by the installed `three` and kept in sync by `scripts/copy-decoders.mjs` — same offline,
 * no-CDN policy as `public/draco/`. Override with `VITE_KTX2_TRANSCODER_PATH` for a CDN.
 */
export const KTX2_TRANSCODER_PATH = import.meta.env.VITE_KTX2_TRANSCODER_PATH ?? withBase('/basis/')

/**
 * The subset of the transcoder's capability probe that decides the output format. Compared as a
 * whole to decide whether a restored context needs a fresh loader.
 */
export interface Ktx2SupportConfig {
  astcSupported: boolean
  etc1Supported: boolean
  etc2Supported: boolean
  dxtSupported: boolean
  bptcSupported: boolean
  pvrtcSupported: boolean
}

let loader: KTX2Loader | null = null
let support: Ktx2SupportConfig | null = null

function readConfig(l: KTX2Loader): Ktx2SupportConfig | null {
  const c = (l as unknown as { workerConfig: Ktx2SupportConfig | null }).workerConfig
  if (!c) return null
  return {
    astcSupported: !!c.astcSupported,
    etc1Supported: !!c.etc1Supported,
    etc2Supported: !!c.etc2Supported,
    dxtSupported: !!c.dxtSupported,
    bptcSupported: !!c.bptcSupported,
    pvrtcSupported: !!c.pvrtcSupported,
  }
}

function sameConfig(a: Ktx2SupportConfig | null, b: Ktx2SupportConfig | null): boolean {
  if (!a || !b) return a === b
  return (
    a.astcSupported === b.astcSupported &&
    a.etc1Supported === b.etc1Supported &&
    a.etc2Supported === b.etc2Supported &&
    a.dxtSupported === b.dxtSupported &&
    a.bptcSupported === b.bptcSupported &&
    a.pvrtcSupported === b.pvrtcSupported
  )
}

/**
 * The bound loader, or `null` when no renderer has bound one yet.
 *
 * Deliberately NOT a lazy constructor: an unbound `KTX2Loader` throws on its first `load()`, so
 * handing one out before {@link bindKtx2Renderer} has run would turn a graceful "no KTX2 here"
 * into a hard failure on whichever asset happened to load first.
 */
export function getKtx2Loader(): KTX2Loader | null {
  return loader
}

/** True once a renderer has been bound and KTX2 assets can actually be transcoded. */
export function isKtx2Ready(): boolean {
  return loader !== null && support !== null
}

/** The detected format support, for probes/diagnostics. `null` before binding. */
export function ktx2Support(): Ktx2SupportConfig | null {
  return support
}

export interface Ktx2BindResult {
  /** A loader is now bound and usable. */
  ready: boolean
  /** This call created the loader (first bind, or a replacement after a support change). */
  created: boolean
  support: Ktx2SupportConfig | null
}

/**
 * Point the shared loader at `gl`. Idempotent and cheap: re-binding the same renderer re-runs
 * `detectSupport` (a handful of `extensions.has()` calls, which three caches) and keeps the
 * existing loader when the answer is unchanged.
 *
 * Called from {@link file://./Ktx2Controller.tsx} during render — not in an effect — so that the
 * loader is usable by siblings rendered after it in the same commit, and again on
 * `webglcontextrestored`.
 */
export function bindKtx2Renderer(gl: WebGLRenderer): Ktx2BindResult {
  const existing = loader
  const probe = existing ?? new KTX2Loader()
  try {
    probe.detectSupport(gl)
  } catch {
    // A renderer without an `extensions` registry (a stubbed test renderer, a lost context mid
    // teardown). Leave whatever was bound before rather than swapping in a half-configured loader.
    return { ready: isKtx2Ready(), created: false, support }
  }
  const next = readConfig(probe)
  if (existing) {
    if (sameConfig(support, next)) {
      support = next
      return { ready: next !== null, created: false, support }
    }
    // The device's format support genuinely changed under us. Existing workers hold the old
    // config and `dispose()` leaves an instance unable to rebuild (see the module docblock), so
    // retire this one and start clean.
    existing.dispose()
    loader = null
    support = null
    const fresh = new KTX2Loader()
    fresh.setTranscoderPath(KTX2_TRANSCODER_PATH)
    fresh.detectSupport(gl)
    loader = fresh
    support = readConfig(fresh)
    return { ready: support !== null, created: true, support }
  }
  probe.setTranscoderPath(KTX2_TRANSCODER_PATH)
  loader = probe
  support = next
  return { ready: next !== null, created: true, support }
}

/** Test-only: drop the singleton so each case starts from an unbound state. */
export function __resetKtx2ForTest(): void {
  loader = null
  support = null
}

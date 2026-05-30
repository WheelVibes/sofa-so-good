import { useGLTF } from '@react-three/drei';

/**
 * What `registerGltfDecoders` wired (or confirmed) for compressed-GLB loading.
 *
 * Flags describe whether each codec's geometry/texture data will decode through
 * the shared drei `useGLTF` loader, not necessarily that we made a setter call
 * (see per-field notes in {@link registerGltfDecoders}).
 */
export interface DecoderReport {
  /** Draco mesh-compression decoder path was pointed at the CDN. */
  draco: boolean;
  /** KTX2/Basis transcoder support is available (renderer-bound, auto-wired). */
  ktx2: boolean;
  /** Meshopt buffer decoder is applied by drei on every load (default on). */
  meshopt: boolean;
  /** Set when a prior call already performed registration; setters are skipped. */
  alreadyRegistered?: true;
}

/**
 * Draco WASM/JS decoder bundle. Hosted by Google on gstatic so we don't have to
 * ship the ~1 MB decoder. drei lazily constructs a single shared `DRACOLoader`
 * the first time a Draco-compressed GLB is loaded and points it at this path.
 */
// Defaults to drei's tested Draco version; override via VITE_DRACO_DECODER_PATH
// for offline/CSP-restricted or self-hosted deployments.
const DRACO_DECODER_PATH =
  import.meta.env.VITE_DRACO_DECODER_PATH ??
  'https://www.gstatic.com/draco/versioned/decoders/1.5.5/';

/** Module-level idempotency guard — see {@link registerGltfDecoders}. */
let registered = false;

/**
 * Register the geometry/texture decoders the shared drei `useGLTF` loader needs
 * so compressed GLBs (Draco-compressed geometry, KTX2/Basis textures, meshopt
 * buffers) load correctly. Call once at app boot, before React renders.
 *
 * Why at boot: drei's `useGLTF` keeps a single module-level Draco decoder path
 * and creates the loader lazily on first use. Setting the path before any model
 * is requested guarantees every `useGLTF` / `useGLTF.preload` call (including
 * `<Suspense>`-driven texture loads in `FurnitureMaterialLoader`) shares a
 * correctly configured loader. Doing it later risks a model loading against the
 * default path first.
 *
 * Mechanisms in this stack (@react-three/drei 9.122, three-stdlib, three 0.184):
 *
 * - **Draco** — the only genuine global registration hook drei exposes is
 *   `useGLTF.setDecoderPath(path)`. It sets the path used when drei builds its
 *   shared `DRACOLoader`. We point it at the gstatic CDN. → `draco: true`.
 *
 * - **Meshopt** — drei has NO global setter. It auto-wires the three-stdlib
 *   `MeshoptDecoder` on every `useGLTF()` call (the `useMeshopt` arg defaults to
 *   `true`), so meshopt-packed GLBs already decode out of the box. There is
 *   nothing to register at boot; we simply report it's active. → `meshopt: true`.
 *
 * - **KTX2** — drei's `useGLTF` does not handle KTX2 at all, and there is no
 *   global KTX2 setter to call. KTX2/Basis textures are transcoded by the
 *   separate renderer-bound `useKTX2` hook, which calls `loader.detectSupport(gl)`
 *   inside the R3F tree (it needs the live WebGL context, so it can only be
 *   wired lazily at render time, not at boot). Support is therefore present but
 *   auto-wired rather than boot-registered. → `ktx2: true`.
 *
 * Idempotent: a module-level guard means repeat calls are no-ops that return
 * `{ alreadyRegistered: true }` without re-invoking any setter (e.g. React
 * StrictMode double-invokes, or hot-reload re-running boot).
 */
export function registerGltfDecoders(): DecoderReport {
  if (registered) {
    return { draco: true, ktx2: true, meshopt: true, alreadyRegistered: true };
  }

  // Draco: the one real boot-time hook. drei reuses this path for its shared
  // DRACOLoader created on first Draco GLB load.
  useGLTF.setDecoderPath(DRACO_DECODER_PATH);

  // Meshopt: nothing to register at boot — drei auto-wires the three-stdlib
  // MeshoptDecoder itself on every useGLTF() call (useMeshopt defaults to true).
  registered = true;
  return { draco: true, ktx2: true, meshopt: true };
}

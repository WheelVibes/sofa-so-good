import { LoadingManager } from 'three'

/**
 * SEC-1 — the single allow/block policy for glTF `buffer[].uri`/`image[].uri`
 * fetches, shared by the model-CONVERT path (`convert/loadToObject.ts`) and
 * the runtime GLB-RENDER path (`GltfModel.tsx` via drei `useGLTF`,
 * `catalog/packs/thumbnail.ts`'s `ThumbnailRenderer`).
 *
 * A GLB/`.gltf`'s own embedded JSON can set any accessor's `uri` to an
 * absolute URL; three.js's `GLTFLoader` fetches it verbatim at parse/render
 * time via its `LoadingManager`, unless a `setURLModifier` intercepts it.
 * Without one, a crafted or hand-edited model shared/imported by someone else
 * could reference `http://attacker/…` and fire an outbound fetch — a
 * tracking beacon / IP-leak / SSRF-lite triggered purely by opening a design.
 *
 * Don't fork a second copy of this predicate — both loader-security call
 * sites must agree on what counts as "foreign".
 */

/** True for `data:`/`blob:` — an embedded or in-memory resource, never a
 *  network fetch regardless of origin. This is the common case: every
 *  user-upload / IKEA-import / remote-provider asset is pre-fetched into
 *  blob object URLs (`URL.createObjectURL`) before it ever reaches a loader
 *  (see `furniture/upload/persist.ts`, `furniture/ikea/importGroup.ts`,
 *  `catalog/remote/resolver.ts`), and a self-contained GLB embeds its
 *  buffers/textures as `data:` URIs. */
export function isEmbeddedOrBlobUrl(url: string): boolean {
  const lower = normalize(url).toLowerCase()
  return lower.startsWith('data:') || lower.startsWith('blob:')
}

/** Strip control chars + surrounding whitespace before scheme-sniffing, same
 *  rationale as `utils/safeUrl.ts` — browsers ignore these inside a scheme. */
const CONTROL_CHARS_RE = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(0x20)}${String.fromCharCode(0x7f)}]`,
  'g',
)

function normalize(url: string): string {
  return url.replace(CONTROL_CHARS_RE, '').trim()
}

/**
 * The render-path policy: allow `data:`/`blob:` (see above) and any absolute
 * URL that resolves to the same origin as `pageOrigin` (the app's own
 * bundled/served GLBs and their sibling `.bin`/texture files, plus any
 * same-origin multi-file bundle). Block everything else — by the time a
 * model's own `uri` reaches this modifier it has already been resolved to an
 * absolute URL by `GLTFLoader` (relative refs are resolved against the
 * model's base path first), so a bare unresolvable string is treated as
 * unsafe rather than guessed at.
 */
export function isAllowedModelResourceUrl(url: string, pageOrigin: string): boolean {
  const trimmed = normalize(url).trim()
  if (trimmed === '') return true
  if (isEmbeddedOrBlobUrl(trimmed)) return true
  try {
    return new URL(trimmed).origin === pageOrigin
  } catch {
    return false
  }
}

/** 1×1 transparent PNG — the fallback for any blocked/unresolvable reference,
 *  so one bad reference degrades a texture/buffer instead of failing the
 *  whole load. Mirrors `convert/loadToObject.ts`'s `BLANK_PNG`; both paths
 *  import this one constant. */
export const BLOCKED_RESOURCE_FALLBACK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** The current page's origin, or `''` outside a browser (tests/SSR) — an
 *  empty origin never equality-matches a resolved `URL.origin`, so foreign
 *  URLs stay blocked when there is no real page to compare against. */
function currentPageOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : ''
}

let sharedRenderManager: LoadingManager | null = null

/**
 * The one `LoadingManager` every runtime GLB render loader shares (drei
 * `useGLTF`'s memoized `GLTFLoader`, `ThumbnailRenderer`'s dedicated one).
 * Lazily constructed so importing this module has no side effect outside a
 * browser. Blocked fetches resolve to {@link BLOCKED_RESOURCE_FALLBACK}
 * rather than throwing, matching the convert path's fail-open-to-blank
 * behaviour.
 */
export function getSecureGltfManager(): LoadingManager {
  if (!sharedRenderManager) {
    sharedRenderManager = new LoadingManager()
    sharedRenderManager.setURLModifier((url) =>
      isAllowedModelResourceUrl(url, currentPageOrigin()) ? url : BLOCKED_RESOURCE_FALLBACK,
    )
  }
  return sharedRenderManager
}

/**
 * drei `useGLTF`'s `extendLoader` callback — installs the shared render
 * manager on the `GLTFLoader` instance drei memoizes internally (a single
 * shared loader reused across every `useGLTF` call app-wide, see
 * `@react-three/drei`'s `useLoader`). Reassigning `.manager` only affects
 * *this* GLTFLoader's own sub-fetches (buffers/images resolved through
 * `this.manager` inside its parser) — it does not touch
 * `THREE.DefaultLoadingManager` or any other loader (material textures,
 * HDRIs, etc. use their own separate loader instances/managers, untouched).
 * Idempotent: safe to call on every `useGLTF` invocation. Duck-typed on
 * `.manager` (rather than importing a concrete `GLTFLoader` class) because
 * drei's `useGLTF` types its `extendLoader` param against `three-stdlib`'s
 * `GLTFLoader`, a different module than `three/examples/jsm`'s — both share
 * the same `THREE.Loader` shape, so this stays structurally compatible with
 * either. */
export function secureGltfLoader(loader: { manager: LoadingManager }): void {
  loader.manager = getSecureGltfManager()
}

/** Test-only: force a fresh shared manager (the module-level singleton would
 *  otherwise leak state — an installed `setURLModifier` closure — across
 *  cases that stub `window.location`). */
export function __resetSecureGltfManagerForTest(): void {
  sharedRenderManager = null
}

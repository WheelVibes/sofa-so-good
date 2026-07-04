import { ImageLoader, type LoadingManager } from 'three'

let patched = false

/** Minimal shape of the pieces of `THREE.ImageLoader` this patch touches. */
interface PatchableImageLoader {
  manager: LoadingManager
  path: string
}

/**
 * Worker-only patch for `THREE.ImageLoader`. Every convert-pipeline loader
 * that can reference an external texture (OBJ+MTL, FBX, Collada, 3DS, 3MF,
 * USDZ, glTF) routes the actual pixel decode through `THREE.TextureLoader`,
 * which internally does `new ImageLoader(manager).load(url, ...)`.
 * `ImageLoader.load` builds a DOM `<img>` element
 * (`document.createElementNS(...)`) and waits for its `load`/`error` events —
 * the ONE genuine DOM dependency in the whole convert pipeline (verified by
 * inspecting every loader used by `loadToObject.ts`: OBJLoader/MTLLoader/
 * FBXLoader/STLLoader/PLYLoader/TDSLoader/ThreeMFLoader/USDZLoader touch
 * `document` only via `TextureLoader`; Collada's `ColladaParser` and
 * `3MFLoader` use `DOMParser`, which — unlike `document` — IS available in a
 * Worker global scope; STL/PLY never load a texture at all).
 *
 * A Worker has no `document`, but it does have `fetch` + `createImageBitmap`,
 * and `GLTFExporter` (`toGlb.ts`) already accepts an `ImageBitmap` for
 * `texture.image` — its `processImage` explicitly type-checks for one (see
 * its own `typeof document === 'undefined' && typeof OffscreenCanvas !==
 * 'undefined'` canvas branch, i.e. three.js already anticipated a
 * document-less export). So the only piece missing for a fully worker-safe
 * convert pipeline is swapping the DOM `<img>` decode for a
 * `createImageBitmap` decode — this function does exactly that, by replacing
 * `ImageLoader.prototype.load` for the lifetime of the worker.
 *
 * Guarded to a genuine Worker realm (`typeof document === 'undefined'`) and
 * idempotent, so importing/calling this on the main thread (or under a
 * happy-dom test, which defines `document`) is always a no-op — safe to call
 * unconditionally from `convert.worker.ts`.
 */
export function patchImageLoaderForWorker(): void {
  if (patched || typeof document !== 'undefined') return
  patched = true

  ImageLoader.prototype.load = function (
    this: PatchableImageLoader,
    url: string,
    onLoad?: (image: ImageBitmap) => void,
    _onProgress?: (event: ProgressEvent) => void,
    onError?: (event: unknown) => void,
  ): undefined {
    // Mirrors the original ImageLoader.load's URL resolution: prepend `path`,
    // then run the LoadingManager's URL modifier (this is how `loadToObject`'s
    // sibling pool rewrites a bare "texture.jpg" reference to its blob: URL).
    const withPath = this.path !== undefined ? this.path + url : url
    const resolved = this.manager.resolveURL(withPath)
    this.manager.itemStart(resolved)
    fetch(resolved)
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        onLoad?.(bitmap)
        this.manager.itemEnd(resolved)
      })
      .catch((err) => {
        onError?.(err)
        this.manager.itemError(resolved)
        this.manager.itemEnd(resolved)
      })
    return undefined
  } as unknown as typeof ImageLoader.prototype.load
}

/** Test-only: reset the idempotency guard so a test can re-verify the patch
 *  installs from a clean state. Not used by production code. */
export function __resetImageLoaderPatchForTest(): void {
  patched = false
}

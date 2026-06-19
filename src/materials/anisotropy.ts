/**
 * Single source of truth for the texture anisotropy cap (RD-401).
 *
 * Anisotropic filtering keeps floors/walls/wood crisp at grazing angles — the
 * single biggest "game-ish" blur tell. The useful maximum is a *device* limit
 * (`renderer.capabilities.getMaxAnisotropy()`, commonly 16) but textures are
 * created before any renderer exists (module-load singletons, the procedural
 * worker hot-swap path), so we cannot read it at creation time. Instead:
 *
 *   - texture creation sites call `getAnisotropy()` — it returns a sane default
 *     (8) until the real cap is known, so early textures still get a good value;
 *   - the first render hands us the renderer via `setMaxAnisotropy(n)` (an R3F
 *     component with `gl`), at which point we clamp the cap to the device max and
 *     re-apply it to every texture already created (so the singletons + cached
 *     materials sharpen too — `needsUpdate` is NOT required for anisotropy
 *     changes, but the maps must already have mipmaps, which CanvasTextures get).
 *
 * Headless/SwiftShader may report a low max (often 1 or 16); we always clamp to
 * the reported value so we never request more than the GPU supports.
 */
import type { Texture } from 'three'

/** Conservative default used until the renderer's real max is known. A typical
 *  desktop GPU reports 16; 8 keeps early-created textures sharp without
 *  over-requesting on weaker hardware (we clamp down once the real max lands). */
const DEFAULT_MAX_ANISOTROPY = 8

let maxAnisotropy = DEFAULT_MAX_ANISOTROPY
let resolved = false

/** Textures created before (or after) the cap is known, tracked so the real
 *  device max can be re-applied to all of them once the renderer reports it.
 *  A `WeakSet` would not be iterable; we hold strong refs but these are the
 *  long-lived shared material singletons + cached maps anyway, and disposed
 *  textures are pruned lazily on re-apply. */
const tracked = new Set<Texture>()

/** Current anisotropy cap — the device max once known, else the default. */
export function getAnisotropy(): number {
  return maxAnisotropy
}

/** Set a texture's anisotropy to the current cap and register it so a later
 *  device-max update re-applies. Returns the texture for chaining. */
export function applyAnisotropy<T extends Texture>(tex: T): T {
  tex.anisotropy = maxAnisotropy
  tracked.add(tex)
  return tex
}

/**
 * Record the renderer's true maximum anisotropy (clamped to a sane floor of 1)
 * and re-apply it to every tracked texture. Idempotent for the same value;
 * called once on first render from a component that has `gl`.
 */
export function setMaxAnisotropy(deviceMax: number): void {
  const next = Math.max(1, Math.floor(deviceMax) || 1)
  if (resolved && next === maxAnisotropy) return
  resolved = true
  maxAnisotropy = next
  for (const tex of tracked) {
    // `source` is non-null for a live texture; a disposed CanvasTexture keeps it
    // but is harmless to touch. We simply set the value (mipmaps already exist).
    tex.anisotropy = next
    tex.needsUpdate = true
  }
}

/** Test-only: reset module state between unit tests. */
export function __resetAnisotropyForTests(): void {
  maxAnisotropy = DEFAULT_MAX_ANISOTROPY
  resolved = false
  tracked.clear()
}

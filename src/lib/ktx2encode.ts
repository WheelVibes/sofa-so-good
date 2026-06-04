/**
 * Best-effort in-browser KTX2 / Basis-Universal (UASTC) texture encoder.
 *
 * KTX2 textures stay GPU-compressed in VRAM — the biggest runtime-memory win on
 * integrated GPUs — but encoding them needs a Basis Universal WASM encoder that
 * isn't a dependency of this stack yet. Until one is wired in, {@link encodeKtx2}
 * resolves `null` and {@link isKtx2EncodeAvailable} returns `false`, so the
 * `ktx2` opt-in transparently falls back to near-lossless WebP (visually
 * identical, just no VRAM win). This mirrors how the offline `optimize_glb_lod`
 * pass falls back to WebP when the `toktx` binary is missing.
 *
 * The real encoder integration (basis_universal WASM) is a documented follow-up
 * — see TODO.md.
 */

/** Encode straight RGBA8 pixels to a KTX2 (UASTC) container. Returns `null` when
 *  no in-browser encoder is available so callers fall back to WebP. */
export async function encodeKtx2(
  _rgba: Uint8Array,
  _width: number,
  _height: number,
): Promise<Uint8Array | null> {
  return null
}

/** True only when an in-browser KTX2/UASTC encoder is available. Currently
 *  always false (no Basis encoder dependency); see the module docs / TODO.md. */
export function isKtx2EncodeAvailable(): boolean {
  return false
}

/**
 * In-browser KTX2 / Basis-Universal (UASTC) texture encoder.
 *
 * KTX2 textures stay GPU-compressed in VRAM — the biggest runtime-memory win on
 * integrated GPUs — so the model-optimize path ({@link encodeKtx2}) re-encodes
 * imported textures to KTX2/UASTC when the caller opts in (`ktx2: true`).
 *
 * The encoder is the Basis Universal WASM build shipped by `ktx2-encoder`. Its
 * glue + wasm are self-hosted under `public/basis/` (copied by
 * `scripts/copy-decoders.mjs`, same offline/no-CDN policy as the transcoder) and
 * the URLs are passed explicitly so the encoder never reaches the package's
 * default upstream CDN. Resolving against Vite's `base` keeps it working in dev
 * (`/basis/`) and under the prod sub-path (`/sofa-so-good/basis/`).
 *
 * In a Node test environment the bare `ktx2-encoder` specifier resolves to the
 * package's node entry, which loads the wasm itself and ignores the URL options —
 * so the same wrapper encodes end-to-end in both browser and Vitest.
 *
 * Tails (see TODO.md): per-channel tuning (normal maps want `isNormalMap` + no
 * perceptual transfer) — currently every map is encoded as a perceptual UASTC
 * texture, which is high-quality lossy and visually safe but not channel-optimal.
 */
import { encodeToKTX2 } from 'ktx2-encoder'
import { withBase } from '../utils/assetUrl'

/** Encode straight RGBA8 pixels to a KTX2 (UASTC + Zstd) container. Returns
 *  `null` on any failure so callers (optimizeGlb) fall back to WebP. */
export async function encodeKtx2(
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array | null> {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return null
  try {
    const data = await encodeToKTX2(rgba, {
      // UASTC (not ETC1S) preserves detail; Zstd supercompression shrinks the file.
      isUASTC: true,
      isKTX2File: true,
      needSupercompression: true,
      generateMipmap: true,
      // Treat the source as sRGB-encoded colour and record the transfer func.
      isPerceptual: true,
      isSetKTX2SRGBTransferFunc: true,
      // We already hold raw RGBA8 — skip the package's PNG/WebGL decode path.
      imageDecoder: async () => ({ data: rgba, width, height }),
      // Self-hosted glue + wasm (no upstream CDN). Ignored by the node entry,
      // which loads the wasm itself — keeps Vitest encoding end-to-end.
      jsUrl: withBase('/basis/basis_encoder.js'),
      wasmUrl: withBase('/basis/basis_encoder.wasm'),
    })
    return data && data.byteLength > 0 ? new Uint8Array(data) : null
  } catch {
    return null
  }
}

/** True when an in-browser KTX2/UASTC encoder is available (now always — the
 *  Basis Universal WASM encoder ships self-hosted under `public/basis/`). */
export function isKtx2EncodeAvailable(): boolean {
  return true
}

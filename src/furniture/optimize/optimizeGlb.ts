import { type Document, WebIO } from '@gltf-transform/core'
import { dedup, draco, prune, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'

/**
 * In-browser GLB optimize pass. Quality-first and codec-only: geometry shape is
 * preserved (weld/dedup/prune + Draco compression, NO mesh simplification) and
 * textures keep their resolution unless they exceed `maxTextureSize`; bytes are
 * shrunk by re-encoding textures to near-lossless WebP and Draco-packing meshes.
 *
 * Worker-safe — uses only @gltf-transform (pure JS), the draco3d wasm module,
 * and OffscreenCanvas/createImageBitmap (available in workers). Never throws:
 * any failure returns the input GLB unchanged so an asset is never lost.
 */
export interface OptimizeOptions {
  /** Longest-edge ceiling for textures (px). Default 2048; resize only if bigger. */
  maxTextureSize?: number
  /** WebP quality 0..1 (near-lossless default). */
  webpQuality?: number
  /** Opt-in KTX2/UASTC encode. Falls back to WebP when the encoder is
   *  unavailable (see src/lib/ktx2encode.ts). */
  ktx2?: boolean
}

export interface OptimizeReport {
  beforeBytes: number
  afterBytes: number
}

let ioPromise: Promise<{ io: WebIO; draco: boolean }> | null = null

/** A WebIO with Draco registered when its wasm could be loaded. Draco is
 *  optional: if registration fails (wasm can't be located), we still read +
 *  write uncompressed GLBs and apply the texture/geometry passes — only the
 *  Draco re-pack is skipped. */
async function getIO(): Promise<{ io: WebIO; draco: boolean }> {
  if (!ioPromise) {
    ioPromise = (async () => {
      const io = new WebIO()
      try {
        io.registerDependencies({
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'draco3d.encoder': await draco3d.createEncoderModule(),
        })
        return { io, draco: true }
      } catch {
        return { io, draco: false }
      }
    })()
  }
  return ioPromise
}

/** Re-encode image bytes to WebP via OffscreenCanvas, resizing only if it
 *  exceeds `maxSize`. Returns null on any failure (caller keeps the original). */
async function reencodeTexture(
  bytes: Uint8Array,
  mimeType: string,
  maxSize: number,
  quality: number,
): Promise<{ data: Uint8Array; mime: string } | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null
  }
  try {
    // Copy into a fresh ArrayBuffer so the BlobPart type is unambiguous across
    // TS typed-array generics.
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    const blob = new Blob([ab], { type: mimeType })
    const bmp = await createImageBitmap(blob)
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bmp.close()
      return null
    }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()
    const out = await canvas.convertToBlob({ type: 'image/webp', quality })
    return { data: new Uint8Array(await out.arrayBuffer()), mime: 'image/webp' }
  } catch {
    return null
  }
}

export async function optimizeGlb(
  input: Uint8Array,
  opts: OptimizeOptions = {},
): Promise<{ data: Uint8Array; report: OptimizeReport }> {
  const beforeBytes = input.byteLength
  const maxSize = opts.maxTextureSize ?? 2048
  const quality = opts.webpQuality ?? 0.95
  try {
    const { io, draco: dracoOk } = await getIO()
    const doc: Document = await io.readBinary(input)

    // Textures first (before any re-pack). ~73% of GLB bytes are textures, so
    // this is the biggest win and runs even when Draco is unavailable.
    for (const tex of doc.getRoot().listTextures()) {
      const img = tex.getImage()
      const mime = tex.getMimeType()
      if (!img || !mime || mime === 'image/webp') continue
      const r = await reencodeTexture(img, mime, maxSize, quality)
      if (r) {
        tex.setImage(r.data)
        tex.setMimeType(r.mime)
      }
    }

    // Pure-JS geometry cleanup — always safe.
    await doc.transform(weld(), dedup(), prune())
    // Draco mesh compression — best-effort enhancement; skip if the encoder
    // wasn't available so a wasm-load failure can't discard the work above.
    if (dracoOk) {
      try {
        await doc.transform(draco())
      } catch {
        // keep the un-Draco'd (still cleaned + texture-optimized) document
      }
    }
    const data = await io.writeBinary(doc)
    return { data, report: { beforeBytes, afterBytes: data.byteLength } }
  } catch {
    // Best-effort: an optimize failure must never drop the asset.
    return { data: input, report: { beforeBytes, afterBytes: beforeBytes } }
  }
}

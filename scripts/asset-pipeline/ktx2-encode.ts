/**
 * Build-time KTX2 / Basis-Universal (UASTC) texture encoder for the offline
 * asset pipeline.
 *
 * Why this exists
 * ───────────────
 * `@gltf-transform/functions` in v4.x cannot emit KTX2 on its own — its
 * `textureCompress({ targetFormat: 'ktx2' })` only routes to the `toktx` binary
 * (KTX-Software) via `@gltf-transform/cli`, and the bundled `ktx2` transform in
 * `ktx2-encoder/gltf-transform` throws under Node (its Node encoder *requires* a
 * caller-supplied `imageDecoder`, which that transform never provides). So there
 * was no in-repo way to produce KTX2 offline without installing a native binary.
 *
 * This module fills that gap by reusing the SAME Basis-Universal WASM encoder the
 * browser uses ({@link file://../../src/lib/ktx2encode.ts}) — the `ktx2-encoder`
 * package's Node entry — and decoding source PNG/JPEG/WebP with `sharp` (already a
 * pipeline dependency) to feed it raw RGBA8. No `toktx` binary, no new heavyweight
 * dependency: it runs anywhere the pipeline already runs.
 *
 * The runtime decodes the result via the renderer-bound `KTX2Loader` that drei's
 * `useGLTF` auto-wires (see `src/furniture/gltf/decoders.ts`) using the
 * self-hosted Basis transcoder under `public/basis/` — so GLBs carrying
 * `KHR_texture_basisu` load with zero extra runtime work.
 *
 * Opt-in only: encoding is CPU-heavy (WASM init + per-texture transcode), so
 * callers must explicitly request it (`processGlb(..., { ktx2: true })`, or the
 * `--ktx2` flag on `scripts/fetch-assets.ts`). When the encoder can't be loaded
 * the transform logs a warning and no-ops, leaving the source textures intact so
 * the offline build never breaks.
 */
import type { Document, Texture, Transform } from '@gltf-transform/core'

/** MIME types the encoder can consume — the raster formats `sharp` decodes and
 *  that a glTF texture may legitimately carry. */
export const KTX2_SUPPORTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface Ktx2EligibilityInput {
  /** The texture's current MIME type. */
  mimeType: string
  /** Texture name (for `pattern` matching). */
  name?: string
  /** Texture URI (for `pattern` matching). */
  uri?: string
  /** Material slots the texture is bound to (for `slotPattern` matching). */
  slots?: string[]
  /** When set, only textures whose name or URI match are encoded. */
  pattern?: RegExp | null
  /** When set, only textures bound to a matching slot are encoded. */
  slotPattern?: RegExp | null
}

export interface Ktx2Decision {
  encode: boolean
  /** Machine-readable reason, useful for logging + tests. */
  reason: 'eligible' | 'already-ktx2' | 'unsupported-mime' | 'pattern-excluded' | 'slot-excluded'
}

/**
 * Pure eligibility decision — no I/O, no encoder. Decides whether a single
 * texture should be re-encoded to KTX2 given its MIME type and the caller's
 * name/slot filters. Idempotent by construction: an `image/ktx2` texture is
 * always skipped, so re-running the pipeline never double-encodes.
 */
export function decideKtx2(input: Ktx2EligibilityInput): Ktx2Decision {
  const { mimeType, name = '', uri = '', slots = [], pattern, slotPattern } = input
  if (mimeType === 'image/ktx2') return { encode: false, reason: 'already-ktx2' }
  if (!(KTX2_SUPPORTED_MIME as readonly string[]).includes(mimeType)) {
    return { encode: false, reason: 'unsupported-mime' }
  }
  if (pattern && !pattern.test(name) && !pattern.test(uri)) {
    return { encode: false, reason: 'pattern-excluded' }
  }
  if (slotPattern && slots.length > 0 && !slots.some((s) => slotPattern.test(s))) {
    return { encode: false, reason: 'slot-excluded' }
  }
  return { encode: true, reason: 'eligible' }
}

/** A slot is a normal-map slot when its name mentions "normal". Normal maps are
 *  encoded as linear (non-perceptual) data, not sRGB colour. */
export function isNormalSlot(slots: string[]): boolean {
  return slots.some((s) => /normal/i.test(s))
}

let availability: Promise<boolean> | null = null

/**
 * True when the build-time KTX2 encoder can run here — i.e. both `ktx2-encoder`
 * (the Basis WASM encoder) and `sharp` (the image decoder) are importable.
 * Memoised; the async import is the honest probe (a missing optional dep or a
 * broken native `sharp` build resolves to `false`).
 */
export async function isKtx2EncoderAvailable(): Promise<boolean> {
  if (!availability) {
    availability = (async () => {
      try {
        await import('ktx2-encoder')
        await import('sharp')
        return true
      } catch {
        return false
      }
    })()
  }
  return availability
}

export interface EncodeImageOptions {
  /** UASTC (high-quality, visually lossless) vs ETC1S. Default UASTC. */
  uastc?: boolean
  /** Treat the source as a linear-data normal map (no sRGB transfer). */
  normalMap?: boolean
}

/**
 * Encode a single source image buffer (PNG/JPEG/WebP bytes) to a KTX2
 * (UASTC + Zstd) container. Decodes to raw RGBA8 with `sharp`, then hands the
 * pixels to the Basis WASM encoder via its `imageDecoder` hook — the same
 * encoder + options the in-browser path uses.
 */
export async function encodeImageToKtx2(
  image: Uint8Array,
  opts: EncodeImageOptions = {},
): Promise<Uint8Array> {
  const sharp = (await import('sharp')).default
  const { encodeToKTX2 } = await import('ktx2-encoder')
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const perceptual = !opts.normalMap
  const result = await encodeToKTX2(image, {
    isUASTC: opts.uastc ?? true,
    isKTX2File: true,
    needSupercompression: true,
    generateMipmap: true,
    isPerceptual: perceptual,
    isSetKTX2SRGBTransferFunc: perceptual,
    isNormalMap: opts.normalMap ?? false,
    // We already hold decoded RGBA8 — bypass the package's own decode path (the
    // Node entry has none and would otherwise throw "imageDecoder is required").
    imageDecoder: async () => ({
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
    }),
  })
  return new Uint8Array(result)
}

/** The material slots a texture is bound to (e.g. `baseColorTexture`,
 *  `normalTexture`) — used for slot filtering + normal-map detection. */
function listTextureSlots(document: Document, texture: Texture): string[] {
  const root = document.getRoot()
  const slots = texture
    .getGraph()
    .listParentEdges(texture)
    .filter((edge) => edge.getParent() !== root)
    .map((edge) => edge.getName())
  return Array.from(new Set(slots))
}

export interface Ktx2TransformOptions {
  /** Only encode textures whose name or URI match. */
  pattern?: RegExp | null
  /** Only encode textures bound to a matching material slot. */
  slots?: RegExp | null
  /** UASTC (default) vs ETC1S. */
  uastc?: boolean
}

/**
 * A `@gltf-transform` {@link Transform} that re-encodes every eligible texture in
 * a document to KTX2/UASTC in place and marks the doc as requiring
 * `KHR_texture_basisu`. Degrades cleanly:
 *   • encoder unavailable → logs a warning and no-ops (source textures untouched);
 *   • a single texture failing to encode → logs and leaves that texture as-is;
 *   • already-KTX2 textures → skipped (idempotent).
 *
 * The writing `NodeIO` must have `KHRTextureBasisu` registered (see
 * `process-glb.ts`) or the encoded doc won't serialise.
 */
export function ktx2(options: Ktx2TransformOptions = {}): Transform {
  return async (document: Document): Promise<void> => {
    const logger = document.getLogger()
    if (!(await isKtx2EncoderAvailable())) {
      logger.warn(
        'ktx2: encoder unavailable (ktx2-encoder / sharp not importable) — skipping KTX2 encode',
      )
      return
    }
    const { KHRTextureBasisu } = await import('@gltf-transform/extensions')
    const textures = document.getRoot().listTextures()
    let encodedAny = false
    for (const [i, texture] of textures.entries()) {
      const slots = listTextureSlots(document, texture)
      const label = texture.getURI() || texture.getName() || `${i + 1}/${textures.length}`
      const decision = decideKtx2({
        mimeType: texture.getMimeType(),
        name: texture.getName(),
        uri: texture.getURI(),
        slots,
        pattern: options.pattern,
        slotPattern: options.slots,
      })
      if (!decision.encode) {
        logger.debug(`ktx2(${label}): skip (${decision.reason})`)
        continue
      }
      const image = texture.getImage()
      if (!image) {
        logger.warn(`ktx2(${label}): no image data — skipping`)
        continue
      }
      try {
        const out = await encodeImageToKtx2(image, {
          uastc: options.uastc ?? true,
          normalMap: isNormalSlot(slots),
        })
        texture.setImage(out).setMimeType('image/ktx2')
        encodedAny = true
        logger.debug(`ktx2(${label}): ${image.byteLength} → ${out.byteLength} bytes`)
      } catch (err) {
        logger.warn(`ktx2(${label}): encode failed — ${(err as Error).message}`)
      }
    }
    if (encodedAny) document.createExtension(KHRTextureBasisu).setRequired(true)
  }
}

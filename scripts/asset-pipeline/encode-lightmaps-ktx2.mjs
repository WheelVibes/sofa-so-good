#!/usr/bin/env node
/**
 * Re-encode a baked lightmap set's PNGs as KTX2/UASTC, writing a sibling directory with its own
 * `index.json`.
 *
 * Usage:
 *   node scripts/asset-pipeline/encode-lightmaps-ktx2.mjs \
 *     [--src public/assets/lightmaps] [--out public/assets/lightmaps-ktx2] [--quality 4]
 *
 * WHY A SEPARATE STEP rather than emitting KTX2 from `bake_material.py`. The bake runs inside
 * Blender's Python, which has no Basis encoder; this runs the same `ktx2-encoder` WASM build the
 * browser and `scripts/asset-pipeline/ktx2-encode.ts` already use, so no `toktx` binary is needed.
 * It is also re-runnable against an existing set, which is what makes the before/after comparison
 * the gain calibration demands possible at all.
 *
 * WHY UASTC AND NOT ETC1S. A lightmap is DATA, not a photograph. Khronos' own tooling guidance puts
 * ETC1S on "images, photos, map data, or albedo/specular textures" and UASTC on everything that is
 * not true colour data (https://github.khronos.org/KTX-Software/ktxtools/ktx_create.html), and
 * donmccurdy's format primer says the same in reverse — ETC1S is "weak on data textures"
 * (https://www.donmccurdy.com/2024/02/11/web-texture-formats/). Measured on this repo's own 229-map
 * set, that call is not close: see `docs/developer/ktx2-textures.md` for the numbers.
 *
 * Four encoder settings are load-bearing, and each one is a way to get this silently wrong:
 *
 * - **`isYFlip: true`.** `TextureLoader` sets `flipY = true`, so a PNG's row 0 is uploaded at
 *   `v = 1`; `CompressedTexture` sets `flipY = false` and three cannot flip block-compressed data
 *   at upload. Without the flip at ENCODE time every atlas slot samples upside down — which, on a
 *   3x2 box atlas whose mirror rows are often near-empty, reads as "some surfaces went dark"
 *   rather than as an obvious flip.
 * - **`isPerceptual: false` + `isSetKTX2SRGBTransferFunc: false`.** The shipped set stores
 *   `pow(v, encode)` and the shader decodes with `pow(t, 1/encode)`, sampling the raw texel; the
 *   PNG path is `NoColorSpace`. Marking the container sRGB would make `KTX2Loader` tag the texture
 *   `SRGBColorSpace` and insert a transfer the PNG set never had.
 * - **`generateMipmap: false`.** `prepareVisibilityTexture` sets `generateMipmaps = false` and
 *   `minFilter = LinearFilter`, so mips would be built, uploaded and never sampled — a third more
 *   VRAM for nothing, and it would make the memory comparison dishonest.
 * - **`enableRDO: false`.** UASTC's rate-distortion pass trades texel accuracy for a smaller Zstd
 *   payload. On an irradiance map that accuracy IS the calibration.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import sharp from 'sharp'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const SRC = path.resolve(arg('src', 'public/assets/lightmaps'))
const OUT = path.resolve(arg('out', 'public/assets/lightmaps-ktx2'))
/** `setPackUASTCFlags` 0-4; higher is slower and better. 4 is `cPackUASTCLevelVerySlow`. */
const QUALITY = Number(arg('quality', '4'))

const indexPath = path.join(SRC, 'index.json')
if (!fs.existsSync(indexPath)) {
  console.error(`No index.json in ${SRC}`)
  process.exit(1)
}
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))

const { encodeToKTX2 } = await import('ktx2-encoder')

fs.mkdirSync(OUT, { recursive: true })

let srcBytes = 0
let outBytes = 0
const outMaps = []

for (const [i, entry] of index.maps.entries()) {
  const srcFile = path.join(SRC, entry.file)
  if (!fs.existsSync(srcFile)) {
    console.error(`missing source map ${entry.file} — refusing to write a partial set`)
    process.exit(1)
  }
  const png = fs.readFileSync(srcFile)
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const encoded = await encodeToKTX2(png, {
    isUASTC: true,
    uastcLDRQualityLevel: QUALITY,
    enableRDO: false,
    isKTX2File: true,
    needSupercompression: true,
    generateMipmap: false,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
    isNormalMap: false,
    isYFlip: true,
    // The Node entry has no built-in decoder; hand it the pixels we already have.
    imageDecoder: async () => ({
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
    }),
  })
  const bytes = new Uint8Array(encoded)
  // **Keep the PNG's own basename and only swap the extension.** The bake already names each map
  // by a content digest, so the name is still immutable and cacheable — and this way
  // `lightmapTexture.ts:pngSiblingUrl` resolves a real file when the transcoder is unavailable.
  // Naming by the KTX2 bytes' own digest instead would silently make that fallback a 404.
  const outName = `${entry.file.replace(/\.png$/i, '')}.ktx2`
  fs.writeFileSync(path.join(OUT, outName), bytes)
  srcBytes += png.byteLength
  outBytes += bytes.byteLength
  outMaps.push({ ...entry, file: outName, format: 'ktx2' })
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${index.maps.length}`)
}

fs.writeFileSync(
  path.join(OUT, 'index.json'),
  `${JSON.stringify({ ...index, format: 'ktx2', maps: outMaps }, null, 1)}\n`,
)

console.log(
  `\n${outMaps.length} maps  ${(srcBytes / 1e6).toFixed(2)} MB PNG -> ${(outBytes / 1e6).toFixed(2)} MB KTX2 ` +
    `(${((outBytes / srcBytes) * 100).toFixed(0)} %)\n-> ${OUT}`,
)

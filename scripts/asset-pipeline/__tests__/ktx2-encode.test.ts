import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { KHRTextureBasisu } from '@gltf-transform/extensions'
import { describe, expect, it } from 'vitest'
import {
  decideKtx2,
  encodeImageToKtx2,
  isKtx2EncoderAvailable,
  isNormalSlot,
  KTX2_SUPPORTED_MIME,
  ktx2,
} from '../ktx2-encode'
import { processGlb } from '../process-glb'

const FIXTURE_GLB = 'scripts/asset-pipeline/__tests__/fixtures/duck.glb'
// KTX2 container identifier: «KTX 20»\r\n\x1A\n
const KTX2_MAGIC = new Uint8Array([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
])

describe('decideKtx2 (pure eligibility)', () => {
  it('encodes supported raster mime types', () => {
    for (const mimeType of KTX2_SUPPORTED_MIME) {
      expect(decideKtx2({ mimeType })).toEqual({ encode: true, reason: 'eligible' })
    }
  })

  it('skips textures that are already KTX2 (idempotent)', () => {
    expect(decideKtx2({ mimeType: 'image/ktx2' })).toEqual({
      encode: false,
      reason: 'already-ktx2',
    })
  })

  it('skips unsupported mime types', () => {
    expect(decideKtx2({ mimeType: 'image/avif' })).toEqual({
      encode: false,
      reason: 'unsupported-mime',
    })
  })

  it('respects the name/uri pattern filter', () => {
    const pattern = /wood/i
    expect(decideKtx2({ mimeType: 'image/png', name: 'oak_wood', pattern }).encode).toBe(true)
    expect(decideKtx2({ mimeType: 'image/png', uri: 'tex/wood.png', pattern }).encode).toBe(true)
    expect(decideKtx2({ mimeType: 'image/png', name: 'metal', pattern })).toEqual({
      encode: false,
      reason: 'pattern-excluded',
    })
  })

  it('respects the slot filter only when the texture has slots', () => {
    const slotPattern = /baseColor/
    expect(
      decideKtx2({ mimeType: 'image/png', slots: ['baseColorTexture'], slotPattern }).encode,
    ).toBe(true)
    expect(decideKtx2({ mimeType: 'image/png', slots: ['normalTexture'], slotPattern })).toEqual({
      encode: false,
      reason: 'slot-excluded',
    })
    // No slots recorded → the slot filter can't exclude it.
    expect(decideKtx2({ mimeType: 'image/png', slots: [], slotPattern }).encode).toBe(true)
  })
})

describe('isNormalSlot', () => {
  it('detects normal-map slots case-insensitively', () => {
    expect(isNormalSlot(['normalTexture'])).toBe(true)
    expect(isNormalSlot(['NormalTexture'])).toBe(true)
    expect(isNormalSlot(['baseColorTexture', 'normalTexture'])).toBe(true)
    expect(isNormalSlot(['baseColorTexture'])).toBe(false)
    expect(isNormalSlot([])).toBe(false)
  })
})

describe('KTX2 encoder availability', () => {
  it('probes the runtime encoder (memoised, boolean)', async () => {
    const available = await isKtx2EncoderAvailable()
    expect(typeof available).toBe('boolean')
    // Same promise result on the second call (memoised).
    expect(await isKtx2EncoderAvailable()).toBe(available)
  })
})

// Integration tests only run where the encoder is actually available. This is
// resolved once, up-front, and used to skip cleanly elsewhere.
const encoderAvailable = await isKtx2EncoderAvailable()
const describeEnc = encoderAvailable ? describe : describe.skip

describeEnc('encodeImageToKtx2 (real WASM encode)', () => {
  it('produces a valid KTX2 container from a PNG', async () => {
    const sharp = (await import('sharp')).default
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 4,
        background: { r: 20, g: 140, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
    const out = await encodeImageToKtx2(new Uint8Array(png))
    expect(out.byteLength).toBeGreaterThan(0)
    expect(out.slice(0, 12)).toEqual(KTX2_MAGIC)
  })
})

describeEnc('ktx2 transform + processGlb integration', () => {
  it('re-encodes GLB textures to KTX2 and adds KHR_texture_basisu', async () => {
    const io = new NodeIO().registerExtensions([KHRTextureBasisu])
    const doc = await io.read(FIXTURE_GLB)
    // Duck fixture ships a PNG texture.
    expect(doc.getRoot().listTextures()[0]?.getMimeType()).toBe('image/png')

    await doc.transform(ktx2())

    const textures = doc.getRoot().listTextures()
    expect(textures.length).toBeGreaterThan(0)
    for (const t of textures) {
      expect(t.getMimeType()).toBe('image/ktx2')
      expect(t.getImage()?.slice(0, 12)).toEqual(KTX2_MAGIC)
    }
    // Extension declared + required so the runtime knows to transcode.
    expect(
      doc
        .getRoot()
        .listExtensionsUsed()
        .map((e) => e.extensionName),
    ).toContain('KHR_texture_basisu')
  })

  it('processGlb with { ktx2: true } writes a loadable GLB with KTX2 textures', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ktx2-glb-'))
    try {
      const out = join(tmp, 'out.glb')
      // compress:false to isolate the KTX2 pass (draco is orthogonal + may be absent).
      await processGlb(FIXTURE_GLB, out, { compress: false, ktx2: true })
      expect(statSync(out).size).toBeGreaterThan(0)
      const io = new NodeIO().registerExtensions([KHRTextureBasisu])
      const doc = await io.read(out)
      expect(doc.getRoot().listTextures()[0]?.getMimeType()).toBe('image/ktx2')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('is idempotent — re-running skips already-KTX2 textures', async () => {
    const io = new NodeIO().registerExtensions([KHRTextureBasisu])
    const doc = await io.read(FIXTURE_GLB)
    await doc.transform(ktx2())
    const firstBytes = doc.getRoot().listTextures()[0]?.getImage()?.byteLength
    await doc.transform(ktx2())
    const secondBytes = doc.getRoot().listTextures()[0]?.getImage()?.byteLength
    expect(secondBytes).toBe(firstBytes)
  })
})

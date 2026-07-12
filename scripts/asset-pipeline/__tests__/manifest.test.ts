import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { furnitureManifestSchema, materialManifestFile, materialManifestSchema } from '../manifest'

describe('furnitureManifestSchema', () => {
  const ok = {
    id: 'kenney-armchair',
    source: 'kenney',
    sourceUrl: 'https://kenney.nl/assets/furniture-kit',
    downloadUrl: 'https://kenney.nl/foo.glb',
    license: 'CC0',
    attribution: 'Kenney',
    name: 'Armchair',
    category: 'seating',
    footprint: { w: 0.8, d: 0.85, h: 0.95 },
  }

  it('accepts a minimal valid entry', () => {
    expect(() => furnitureManifestSchema.parse(ok)).not.toThrow()
  })

  it('rejects an invalid category', () => {
    expect(() => furnitureManifestSchema.parse({ ...ok, category: 'bogus' })).toThrow()
  })

  it('rejects a non-CC0 license', () => {
    expect(() => furnitureManifestSchema.parse({ ...ok, license: 'CC-BY' })).toThrow()
  })

  it('rejects negative footprint dims', () => {
    expect(() =>
      furnitureManifestSchema.parse({
        ...ok,
        footprint: { w: -1, d: 0.5, h: 0.5 },
      }),
    ).toThrow()
  })

  it('defaults scale to 1.0 and anchor to floor-center when omitted', () => {
    const parsed = furnitureManifestSchema.parse(ok)
    expect(parsed.scale).toBe(1.0)
    expect(parsed.anchor).toBe('floor-center')
  })
})

describe('materialManifestSchema', () => {
  const ok = {
    id: 'floor-wood-oak',
    source: 'polyhaven',
    sourceUrl: 'https://polyhaven.com/a/wood_floor_deck',
    downloads: {
      albedo: 'https://polyhaven.com/diff.jpg',
      normal: 'https://polyhaven.com/nor.jpg',
      rough: 'https://polyhaven.com/rough.jpg',
    },
    license: 'CC0',
    attribution: 'Poly Haven',
    name: 'Oak planks',
    category: 'floor',
    uvScale: [1.5, 1.5],
  }

  it('accepts a minimal valid entry', () => {
    expect(() => materialManifestSchema.parse(ok)).not.toThrow()
  })

  it('requires albedo download', () => {
    const { downloads, ...rest } = ok
    expect(() =>
      materialManifestSchema.parse({
        ...rest,
        downloads: { normal: downloads.normal },
      }),
    ).toThrow()
  })
})

// FETCH-MANIFEST-BACKFILL regression guard: the manifest is the source of truth
// for a `npm run fetch-assets` re-run, which rewrites each material's on-disk
// sidecar from `downloads` alone. If an entry's on-disk sidecar carries a
// normal/rough channel but the manifest omits that download URL, a re-fetch
// silently DROPS the channel (the exact bug 6 albedo-only entries had:
// carpet/parquet/beige/brick/plaster/stone-brick). Assert the manifest never
// drifts behind its own bundled sidecars so the regression can't recur.
describe('material manifest ⇄ bundled sidecar channel parity', () => {
  const repoRoot = join(__dirname, '../../..')
  const manifest = materialManifestFile.parse(
    JSON.parse(readFileSync(join(repoRoot, 'assets/manifest/materials.json'), 'utf8')),
  )

  for (const entry of manifest) {
    const sidecarPath = join(repoRoot, 'public/assets/materials', entry.id, 'material.json')
    if (!existsSync(sidecarPath)) continue
    const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8')) as {
      channels: Record<string, string>
    }

    it(`${entry.id}: manifest lists every channel present on disk`, () => {
      for (const channel of ['normal', 'rough'] as const) {
        if (sidecar.channels[channel]) {
          expect(
            entry.downloads[channel],
            `${entry.id} sidecar has a ${channel} map but manifest downloads.${channel} is missing — a re-fetch would drop it`,
          ).toBeTruthy()
        }
      }
    })
  }
})

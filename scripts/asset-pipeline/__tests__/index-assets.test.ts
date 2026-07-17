import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { indexAssets } from '../index-assets'
import { writeSidecar } from '../sidecar'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'index-test-'))
  mkdirSync(join(root, 'public/assets/furniture'), { recursive: true })
  mkdirSync(join(root, 'public/assets/materials'), { recursive: true })
  mkdirSync(join(root, 'src/furniture'), { recursive: true })
  mkdirSync(join(root, 'src/materials'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('indexAssets', () => {
  it('emits a TS module containing entries for each GLB', async () => {
    const glb = join(root, 'public/assets/furniture/duck.glb')
    copyFileSync('scripts/asset-pipeline/__tests__/fixtures/duck.glb', glb)
    writeSidecar(glb, {
      id: 'duck-fixture',
      name: 'Duck fixture',
      category: 'decor',
      footprint: { w: 0.6, d: 0.6, h: 1.0 },
      scale: 0.005,
      anchor: 'floor-center',
      license: 'CC0',
      attribution: 'Khronos',
      sourceUrl: 'https://github.com/KhronosGroup/glTF-Sample-Models',
    })
    await indexAssets({ projectRoot: root })
    const out = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8')
    expect(out).toContain('"duck-fixture"')
    expect(out).toContain('"decor"')
    // base-aware URL so it resolves under a non-root Vite `base` in production
    // biome-ignore lint/suspicious/noTemplateCurlyInString: asserting the generated code contains this exact literal
    expect(out).toContain('`${import.meta.env.BASE_URL}assets/furniture/duck.glb`')
    expect(out).toContain('"Khronos"')
  })

  it('throws on duplicate ids', async () => {
    const a = join(root, 'public/assets/furniture/a.glb')
    const b = join(root, 'public/assets/furniture/b.glb')
    copyFileSync('scripts/asset-pipeline/__tests__/fixtures/duck.glb', a)
    copyFileSync('scripts/asset-pipeline/__tests__/fixtures/duck.glb', b)
    const sidecar = {
      id: 'same-id',
      name: 'X',
      category: 'decor' as const,
      footprint: { w: 1, d: 1, h: 1 },
      scale: 1.0,
      anchor: 'floor-center' as const,
    }
    writeSidecar(a, sidecar)
    writeSidecar(b, sidecar)
    await expect(indexAssets({ projectRoot: root })).rejects.toThrow(/duplicate id/)
  })

  it('auto-detects a sidecar-less material folder from filenames', async () => {
    // Mimic a bare ambientCG download dropped straight into the materials dir.
    const dir = join(root, 'public/assets/materials/wall-bricks-075')
    mkdirSync(dir, { recursive: true })
    for (const f of [
      'Bricks075A_1K-JPG_Color.jpg',
      'Bricks075A_1K-JPG_NormalGL.jpg',
      'Bricks075A_1K-JPG_Roughness.jpg',
      'Bricks075A_1K-JPG_AmbientOcclusion.jpg',
      'Bricks075A_1K-JPG_Displacement.jpg', // unsupported → ignored
    ]) {
      writeFileSync(join(dir, f), 'x')
    }
    await indexAssets({ projectRoot: root })
    const out = readFileSync(join(root, 'src/materials/generatedCatalog.ts'), 'utf8')
    expect(out).toContain('"wall-bricks-075"')
    expect(out).toContain('Bricks075A_1K-JPG_Color.jpg')
    expect(out).toContain('Bricks075A_1K-JPG_NormalGL.jpg')
    expect(out).toContain('Bricks075A_1K-JPG_Roughness.jpg')
    expect(out).toContain('Bricks075A_1K-JPG_AmbientOcclusion.jpg')
    // displacement is not a runtime-bound channel — must not leak in
    expect(out).not.toContain('Displacement')
  })

  it('skips a sidecar-less folder that has no albedo', async () => {
    const dir = join(root, 'public/assets/materials/floor-broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'floor_nor_gl.jpg'), 'x')
    await indexAssets({ projectRoot: root })
    const out = readFileSync(join(root, 'src/materials/generatedCatalog.ts'), 'utf8')
    expect(out).not.toContain('floor-broken')
  })

  it('lets a sidecar win over auto-detection', async () => {
    const dir = join(root, 'public/assets/materials/floor-sidecar')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'some_diff.jpg'), 'x')
    writeSidecar(join(dir, 'material'), {
      id: 'hand-authored-floor',
      name: 'Hand authored',
      category: 'floor',
      uvScale: [3, 3],
      channels: { albedo: 'some_diff.jpg' },
    })
    await indexAssets({ projectRoot: root })
    const out = readFileSync(join(root, 'src/materials/generatedCatalog.ts'), 'utf8')
    // sidecar id + uvScale win; the auto-detect id (the folder name) is not used
    expect(out).toContain('"hand-authored-floor"')
    expect(out).toContain('[3, 3]')
    expect(out).not.toContain('id: "floor-sidecar"')
  })

  it('emits an empty catalog when no assets exist', async () => {
    await indexAssets({ projectRoot: root })
    const out = readFileSync(join(root, 'src/furniture/generatedCatalog.ts'), 'utf8')
    expect(out).toContain('export const GENERATED_FURNITURE')
    expect(out).toContain('[]')
  })
})

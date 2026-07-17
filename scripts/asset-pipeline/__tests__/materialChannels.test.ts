import { describe, expect, it } from 'vitest'
import { detectMaterialChannels, inferMaterialSidecar } from '../materialChannels'

describe('detectMaterialChannels', () => {
  it('maps Poly Haven snake_case suffixes', () => {
    const { channels, warnings } = detectMaterialChannels([
      'dirty_carpet_diff_2k.jpg',
      'dirty_carpet_nor_gl_2k.jpg',
      'dirty_carpet_rough_2k.jpg',
      'dirty_carpet_ao_2k.jpg',
    ])
    expect(channels).toEqual({
      albedo: 'dirty_carpet_diff_2k.jpg',
      normal: 'dirty_carpet_nor_gl_2k.jpg',
      rough: 'dirty_carpet_rough_2k.jpg',
      ao: 'dirty_carpet_ao_2k.jpg',
    })
    expect(warnings).toHaveLength(0)
  })

  it('maps ambientCG PascalCase names', () => {
    const { channels } = detectMaterialChannels([
      'Bricks075A_1K-JPG_Color.jpg',
      'Bricks075A_1K-JPG_NormalGL.jpg',
      'Bricks075A_1K-JPG_Roughness.jpg',
      'Bricks075A_1K-JPG_AmbientOcclusion.jpg',
    ])
    expect(channels).toEqual({
      albedo: 'Bricks075A_1K-JPG_Color.jpg',
      normal: 'Bricks075A_1K-JPG_NormalGL.jpg',
      rough: 'Bricks075A_1K-JPG_Roughness.jpg',
      ao: 'Bricks075A_1K-JPG_AmbientOcclusion.jpg',
    })
  })

  it('recognises albedo aliases (albedo/basecolor/col)', () => {
    expect(detectMaterialChannels(['wood_albedo.png']).channels.albedo).toBe('wood_albedo.png')
    expect(detectMaterialChannels(['wood_BaseColor.png']).channels.albedo).toBe(
      'wood_BaseColor.png',
    )
    expect(detectMaterialChannels(['wood_col_1k.png']).channels.albedo).toBe('wood_col_1k.png')
  })

  it('is case-insensitive', () => {
    const { channels } = detectMaterialChannels(['TILE_DIFF.PNG', 'TILE_NOR_GL.PNG'])
    expect(channels.albedo).toBe('TILE_DIFF.PNG')
    expect(channels.normal).toBe('TILE_NOR_GL.PNG')
  })

  it('prefers GL normals over DX and warns about the discard', () => {
    const { channels, warnings } = detectMaterialChannels(['x_nor_dx_2k.jpg', 'x_nor_gl_2k.jpg'])
    expect(channels.normal).toBe('x_nor_gl_2k.jpg')
    expect(warnings.some((w) => w.includes('normal') && w.includes('x_nor_dx_2k.jpg'))).toBe(true)
  })

  it('picks deterministically and warns on duplicate albedo candidates', () => {
    const a = detectMaterialChannels(['b_diff.jpg', 'a_albedo.jpg'])
    const b = detectMaterialChannels(['a_albedo.jpg', 'b_diff.jpg'])
    // sorted → same pick regardless of input order
    expect(a.channels.albedo).toBe('a_albedo.jpg')
    expect(b.channels.albedo).toBe('a_albedo.jpg')
    expect(a.warnings.some((w) => w.includes('albedo'))).toBe(true)
  })

  it('reports metalness/displacement/ARM as ignored, never as a bound map', () => {
    const { channels, ignored } = detectMaterialChannels([
      'm_diff.jpg',
      'm_metallic.jpg',
      'm_disp.jpg',
      'm_height.jpg',
      'm_arm.jpg',
    ])
    expect(channels).toEqual({ albedo: 'm_diff.jpg' })
    const chans = ignored.map((i) => i.channel)
    expect(chans).toContain('metalness')
    expect(chans).toContain('displacement')
    expect(chans).toContain('arm')
  })

  it('ignores non-raster / EXR sources', () => {
    const { channels } = detectMaterialChannels([
      'x_diff.jpg',
      'x_nor_gl.exr',
      'x_disp.tif',
      'material.json',
      'README.md',
    ])
    expect(channels).toEqual({ albedo: 'x_diff.jpg' })
  })

  it('warns when no albedo can be found', () => {
    const { channels, warnings } = detectMaterialChannels(['x_nor_gl.jpg', 'x_rough.jpg'])
    expect(channels.albedo).toBeUndefined()
    expect(warnings.some((w) => w.includes('no albedo'))).toBe(true)
  })
})

describe('inferMaterialSidecar', () => {
  it('builds a floor sidecar from a bare folder', () => {
    const { sidecar } = inferMaterialSidecar('floor-oak-planks', [
      'floor_oak_planks_diff_2k.jpg',
      'floor_oak_planks_nor_gl_2k.jpg',
      'floor_oak_planks_rough_2k.jpg',
    ])
    expect(sidecar).toEqual({
      id: 'floor-oak-planks',
      name: 'Floor Oak Planks',
      category: 'floor',
      uvScale: [1, 1],
      channels: {
        albedo: 'floor_oak_planks_diff_2k.jpg',
        normal: 'floor_oak_planks_nor_gl_2k.jpg',
        rough: 'floor_oak_planks_rough_2k.jpg',
      },
      license: 'CC0',
    })
  })

  it('infers wall category from the folder name', () => {
    const { sidecar } = inferMaterialSidecar('wall-brick', ['brick_Color.jpg'])
    expect(sidecar?.category).toBe('wall')
  })

  it('returns null when no albedo is present', () => {
    const { sidecar, detection } = inferMaterialSidecar('x', ['x_nor_gl.jpg'])
    expect(sidecar).toBeNull()
    expect(detection.warnings.some((w) => w.includes('no albedo'))).toBe(true)
  })
})

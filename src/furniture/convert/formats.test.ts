import { describe, expect, it } from 'vitest'
import { detectModelFormat, isModelEntryFile, MODEL_EXTENSIONS } from './formats'

function fileWithBytes(name: string, bytes: number[]): File {
  return new File([new Uint8Array(bytes)], name)
}

describe('detectModelFormat', () => {
  it('detects GLB by magic header', async () => {
    const f = fileWithBytes('x.glb', [0x67, 0x6c, 0x54, 0x46]) // 'glTF'
    expect(await detectModelFormat(f)).toBe('glb')
  })
  it('detects FBX binary by magic string', async () => {
    const magic = Array.from('Kaydara FBX Binary  ').map((c) => c.charCodeAt(0))
    expect(await detectModelFormat(fileWithBytes('x.fbx', magic))).toBe('fbx')
  })
  it('detects PLY by header', async () => {
    const magic = Array.from('ply\n').map((c) => c.charCodeAt(0))
    expect(await detectModelFormat(fileWithBytes('x.ply', magic))).toBe('ply')
  })
  it('detects ASCII FBX by its comment header even when mis-extensioned (IO-009)', async () => {
    const magic = Array.from('; FBX 7.4.0 project file').map((c) => c.charCodeAt(0))
    // A file named .obj that is actually ASCII FBX routes to the FBX loader.
    expect(await detectModelFormat(fileWithBytes('mislabeled.obj', magic))).toBe('fbx')
    expect(await detectModelFormat(fileWithBytes('x.fbx', magic))).toBe('fbx')
  })
  it('falls back to extension for obj/stl/dae/3mf/usdz/gltf', async () => {
    expect(await detectModelFormat(fileWithBytes('a.obj', [111]))).toBe('obj')
    expect(await detectModelFormat(fileWithBytes('a.stl', [1]))).toBe('stl')
    expect(await detectModelFormat(fileWithBytes('a.dae', [60]))).toBe('dae')
    expect(await detectModelFormat(fileWithBytes('a.3ds', [0x4d]))).toBe('3ds')
    expect(await detectModelFormat(fileWithBytes('a.3mf', [80]))).toBe('3mf')
    expect(await detectModelFormat(fileWithBytes('a.usdz', [80]))).toBe('usdz')
    expect(await detectModelFormat(fileWithBytes('a.gltf', [123]))).toBe('gltf')
  })
  it('returns null for unknown', async () => {
    expect(await detectModelFormat(fileWithBytes('a.mtl', [1]))).toBeNull()
  })
  it('isModelEntryFile matches every model extension, not mtl/bin/textures', () => {
    for (const ext of MODEL_EXTENSIONS) expect(isModelEntryFile(`m${ext}`)).toBe(true)
    expect(isModelEntryFile('a.mtl')).toBe(false)
    expect(isModelEntryFile('a.bin')).toBe(false)
    expect(isModelEntryFile('a.png')).toBe(false)
  })
})

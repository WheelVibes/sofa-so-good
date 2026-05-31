import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import { dedupeName, importGlbFiles, isModelFile, modelName } from './bulkImport'

const duckBytes = readFileSync(
  resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb'),
)

function glbFile(name: string, relPath?: string): File {
  const f = new File([new Uint8Array(duckBytes)], name, { type: 'model/gltf-binary' })
  if (relPath) Object.defineProperty(f, 'webkitRelativePath', { value: relPath })
  return f
}
function textFile(name: string): File {
  return new File(['hello'], name, { type: 'text/plain' })
}
function badGlb(name: string): File {
  return new File([new Uint8Array(12)], name, { type: 'model/gltf-binary' }) // 12 bytes, no glTF magic header → validateGlbFile rejects
}

describe('bulkImport file filtering', () => {
  it('recognises .glb and .gltf case-insensitively, rejects others', () => {
    expect(isModelFile('chair.glb')).toBe(true)
    expect(isModelFile('CHAIR.GLTF')).toBe(true)
    expect(isModelFile('readme.txt')).toBe(false)
    expect(isModelFile('texture.png')).toBe(false)
    expect(isModelFile('noext')).toBe(false)
  })

  it('derives a display name from the basename without extension', () => {
    expect(modelName('chair.glb')).toBe('chair')
    expect(modelName('models/sofas/Big Sofa.gltf')).toBe('Big Sofa')
    expect(modelName('a.b.glb')).toBe('a.b')
    expect(modelName('.glb')).toBe('.glb')
  })
})

describe('bulkImport name dedupe', () => {
  it('returns the name unchanged when unused', () => {
    const used = new Set<string>()
    expect(dedupeName('Chair', used)).toBe('Chair')
  })

  it('suffixes (2), (3) on collision and reserves each result', () => {
    const used = new Set<string>(['Chair'])
    expect(dedupeName('Chair', used)).toBe('Chair (2)')
    expect(dedupeName('Chair', used)).toBe('Chair (3)')
    expect(dedupeName('Sofa', used)).toBe('Sofa')
  })
})

describe('importGlbFiles', () => {
  beforeEach(async () => {
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
    useStore.getState().setUserFurniture([])
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test' })
  })

  it('imports every valid model and registers it in the store', async () => {
    const res = await importGlbFiles([glbFile('chair.glb'), glbFile('table.glb')], {
      category: 'seating',
    })
    expect(res.total).toBe(2)
    expect(res.imported).toBe(2)
    expect(res.skipped).toEqual([])
    expect(useStore.getState().userFurniture).toHaveLength(2)
    expect(await IdbAssetStore.list()).toHaveLength(2)
  })

  it('skips non-model files and invalid GLBs, importing the rest', async () => {
    const res = await importGlbFiles(
      [glbFile('ok.glb'), textFile('notes.txt'), badGlb('broken.glb')],
      { category: 'decor' },
    )
    expect(res.total).toBe(3)
    expect(res.imported).toBe(1)
    expect(res.skipped).toHaveLength(2)
    expect(res.skipped.find((s) => s.name === 'notes.txt')?.reason).toBe('not-a-model')
    expect(res.skipped.find((s) => s.name === 'broken.glb')?.reason).toBeTruthy()
    expect(useStore.getState().userFurniture).toHaveLength(1)
  })

  it('dedupes names within the batch and against existing furniture', async () => {
    await importGlbFiles([glbFile('Lamp.glb')], { category: 'lighting' })
    const res = await importGlbFiles([glbFile('Lamp.glb'), glbFile('Lamp.glb')], {
      category: 'lighting',
    })
    const names = useStore
      .getState()
      .userFurniture.map((d) => d.name)
      .sort()
    expect(names).toEqual(['Lamp', 'Lamp (2)', 'Lamp (3)'])
    expect(res.imported).toBe(2)
  })

  it('uses the webkitRelativePath basename for naming on folder picks', async () => {
    await importGlbFiles([glbFile('blob', 'MyFolder/sub/Side Table.glb')], { category: 'tables' })
    expect(useStore.getState().userFurniture[0].name).toBe('Side Table')
  })

  it('reports progress reaching (total, total)', async () => {
    const calls: Array<[number, number]> = []
    await importGlbFiles(
      [glbFile('a.glb'), textFile('b.txt'), glbFile('c.glb')],
      { category: 'decor' },
      (done, total) => calls.push([done, total]),
    )
    expect(calls.at(-1)).toEqual([3, 3])
    expect(calls.every(([, t]) => t === 3)).toBe(true)
    expect(calls.length).toBe(3)
  })

  it('reports a failed folder-picked file by its real basename', async () => {
    const bad = new File([new Uint8Array(12)], 'blob', { type: 'model/gltf-binary' })
    Object.defineProperty(bad, 'webkitRelativePath', { value: 'Folder/Broken Chair.glb' })
    const res = await importGlbFiles([bad], { category: 'decor' })
    expect(res.imported).toBe(0)
    expect(res.skipped).toHaveLength(1)
    expect(res.skipped[0].name).toBe('Broken Chair.glb')
  })

  it('imports every valid file even when the batch exceeds the pool size', async () => {
    const files = Array.from({ length: 10 }, (_, i) => glbFile(`m${i}.glb`))
    const res = await importGlbFiles(files, { category: 'decor', concurrency: 3 })
    expect(res.imported).toBe(10)
    expect(useStore.getState().userFurniture).toHaveLength(10)
  })
})

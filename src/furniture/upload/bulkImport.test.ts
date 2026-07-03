import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IdbAssetStore } from '../../state/storage/IdbAssetStore'
import { useStore } from '../../state/store'
import * as runOptimizeModule from '../optimize/runOptimize'
import {
  dedupeName,
  EARLY_REJECT_MULTIPLIER,
  importGlbFiles,
  isModelFile,
  modelName,
} from './bulkImport'
import { MAX_GLB_BYTES } from './validate'

const duckBytes = readFileSync(
  resolve(__dirname, '../../../scripts/asset-pipeline/__tests__/fixtures/duck.glb'),
)

let glbSeq = 0
function glbFile(name: string, relPath?: string): File {
  // Append a per-CALL unique suffix so each fixture has DISTINCT content —
  // otherwise the content-hash dedup would collapse them (these tests exercise
  // NAME disambiguation, with genuinely different files). Trailing bytes after
  // the GLB header don't affect validateGlbFile (it checks the magic at off 0).
  const f = new File([new Uint8Array(duckBytes), `#${glbSeq++}`], name, {
    type: 'model/gltf-binary',
  })
  if (relPath) Object.defineProperty(f, 'webkitRelativePath', { value: relPath })
  return f
}
/** Two files with identical bytes (same content hash) — for dedup tests. */
function sameContentGlb(name: string): File {
  return new File([new Uint8Array(duckBytes)], name, { type: 'model/gltf-binary' })
}
function textFile(name: string): File {
  return new File(['hello'], name, { type: 'text/plain' })
}
function badGlb(name: string): File {
  return new File([new Uint8Array(12)], name, { type: 'model/gltf-binary' }) // 12 bytes, no glTF magic header → validateGlbFile rejects
}
/** A file with a valid glTF magic header (borrowed from the duck fixture)
 *  padded to `bytesLen` — used to exercise the IO-002 early size-cap gate,
 *  which fires on the raw byte length before any optimize/parse work happens
 *  (so the padding never needs to be valid GLB structure past the header). */
function paddedGlb(name: string, bytesLen: number): File {
  const bytes = new Uint8Array(bytesLen)
  bytes.set(duckBytes.subarray(0, Math.min(duckBytes.length, bytes.length)))
  return new File([bytes], name, { type: 'model/gltf-binary' })
}
/** Hopelessly oversized: past the EARLY gate line (multiplier × cap). */
function hopelessGlb(name: string): File {
  return paddedGlb(name, EARLY_REJECT_MULTIPLIER * MAX_GLB_BYTES + 1024)
}
/** Over the cap but plausibly compressible: between cap and multiplier × cap —
 *  must NOT be early-rejected (it keeps its optimize chance). */
function compressibleCandidateGlb(name: string): File {
  return paddedGlb(name, MAX_GLB_BYTES + 1024)
}

describe('bulkImport file filtering', () => {
  it('recognises GLB/glTF + convertible model formats, rejects siblings/others', () => {
    expect(isModelFile('chair.glb')).toBe(true)
    expect(isModelFile('CHAIR.GLTF')).toBe(true)
    // convertible formats now count as model entry files
    expect(isModelFile('chair.obj')).toBe(true)
    expect(isModelFile('chair.FBX')).toBe(true)
    expect(isModelFile('chair.stl')).toBe(true)
    expect(isModelFile('chair.ply')).toBe(true)
    expect(isModelFile('chair.dae')).toBe(true)
    expect(isModelFile('chair.3mf')).toBe(true)
    expect(isModelFile('chair.usdz')).toBe(true)
    // sibling/material files are NOT model entry files
    expect(isModelFile('chair.mtl')).toBe(false)
    expect(isModelFile('scene.bin')).toBe(false)
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

  it('handles an empty batch (0 items) without spawning any pool workers', async () => {
    const res = await importGlbFiles([], { category: 'decor' })
    expect(res).toEqual({ total: 0, imported: 0, duplicates: 0, skipped: [] })
    expect(useStore.getState().userFurniture).toHaveLength(0)
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
    expect(res.duplicates).toBe(0)
    expect(useStore.getState().userFurniture).toHaveLength(10)
  })

  it('skips identical-content files within a batch (counts them as duplicates)', async () => {
    const files = [sameContentGlb('a.glb'), sameContentGlb('b.glb'), sameContentGlb('c.glb')]
    const res = await importGlbFiles(files, { category: 'decor' })
    expect(res.imported).toBe(1)
    expect(res.duplicates).toBe(2)
    expect(useStore.getState().userFurniture).toHaveLength(1)
  })

  it('skips a re-upload of a file already in the catalog', async () => {
    const first = await importGlbFiles([sameContentGlb('dup.glb')], { category: 'decor' })
    expect(first.imported).toBe(1)
    const again = await importGlbFiles([sameContentGlb('dup-again.glb')], { category: 'decor' })
    expect(again.imported).toBe(0)
    expect(again.duplicates).toBe(1)
    expect(useStore.getState().userFurniture).toHaveLength(1)
  })
})

describe('bulkImport early size-cap gate (IO-002)', () => {
  beforeEach(async () => {
    for (const a of await IdbAssetStore.list()) await IdbAssetStore.delete(a.assetId)
    useStore.getState().setUserFurniture([])
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:test' })
  })

  it('rejects a hopeless GLB (> multiplier × cap) before optimize runs (no worker/CPU spent)', async () => {
    const spy = vi.spyOn(runOptimizeModule, 'runOptimize')
    const res = await importGlbFiles([hopelessGlb('huge.glb')], { category: 'decor' })
    expect(res.imported).toBe(0)
    expect(res.skipped).toHaveLength(1)
    expect(res.skipped[0].name).toBe('huge.glb')
    expect(res.skipped[0].reason).toMatch(/even after optimization this can't fit/i)
    // The whole point of the early gate: optimize is never invoked for a file
    // that can't plausibly fit under the cap even after compressing.
    expect(spy).not.toHaveBeenCalled()
    expect(useStore.getState().userFurniture).toHaveLength(0)
    spy.mockRestore()
  })

  it('a between-cap-and-multiplier file is NOT early-rejected — it keeps its optimize chance', async () => {
    // The scenario the multiplier headroom exists for: a source over the cap
    // that optimize could shrink under it (Draco+WebP routinely 5-10×). Mock
    // the optimize pass to return a small result and assert the file imports —
    // i.e. the early gate let it through to runOptimize instead of rejecting.
    const small = new Uint8Array(duckBytes)
    const spy = vi.spyOn(runOptimizeModule, 'runOptimize').mockResolvedValue({
      data: small,
      report: { beforeBytes: MAX_GLB_BYTES + 1024, afterBytes: small.byteLength },
    })
    const res = await importGlbFiles([compressibleCandidateGlb('borderline.glb')], {
      category: 'decor',
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(res.imported).toBe(1)
    expect(res.skipped).toEqual([])
    expect(useStore.getState().userFurniture).toHaveLength(1)
    spy.mockRestore()
  })

  it('a between-cap-and-multiplier file that does NOT compress under the cap fails at the post-optimize gate', async () => {
    // Same input band, but optimize couldn't shrink it (mock returns the input
    // unchanged — matching optimizeGlb's best-effort fallback). The real cap is
    // enforced post-optimize with the "even after optimization" message.
    const stillBig = new Uint8Array(MAX_GLB_BYTES + 1024)
    stillBig.set(duckBytes.subarray(0, duckBytes.length))
    const spy = vi.spyOn(runOptimizeModule, 'runOptimize').mockResolvedValue({
      data: stillBig,
      report: { beforeBytes: stillBig.byteLength, afterBytes: stillBig.byteLength },
    })
    const res = await importGlbFiles([compressibleCandidateGlb('incompressible.glb')], {
      category: 'decor',
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(res.imported).toBe(0)
    expect(res.skipped).toHaveLength(1)
    expect(res.skipped[0].reason).toMatch(/over the .* limit even after optimization/i)
    spy.mockRestore()
  })

  it('does not reject a normal, under-cap file', async () => {
    const res = await importGlbFiles([glbFile('normal.glb')], { category: 'decor' })
    expect(res.imported).toBe(1)
    expect(res.skipped).toEqual([])
  })

  it('one hopeless file in a batch does not block the others', async () => {
    const res = await importGlbFiles(
      [glbFile('ok-a.glb'), hopelessGlb('too-big.glb'), glbFile('ok-b.glb')],
      { category: 'decor' },
    )
    expect(res.imported).toBe(2)
    expect(res.skipped).toHaveLength(1)
    expect(res.skipped[0].name).toBe('too-big.glb')
    expect(useStore.getState().userFurniture).toHaveLength(2)
  })
})

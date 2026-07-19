import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sh3fEntry, Sh3fParseResult } from '../furniture/import/sh3f'

// Mock the heavy DOM/three convert leg + the IndexedDB persist leg so the import
// orchestration (resolve → convert → persist → batch commit → summary) is unit-
// testable in Node without a browser. `vi.hoisted` keeps the shared spies/class
// available inside the hoisted `vi.mock` factories.
const { FakeConvertError, convertModel, persistUserGlb } = vi.hoisted(() => {
  class FakeConvertError extends Error {}
  return {
    FakeConvertError,
    convertModel: vi.fn(async (entry: File) => {
      if (entry.name === 'fail.obj') throw new FakeConvertError('conversion blew up')
      // Per-entry bytes: the importer now content-hash-dedups WITHIN a batch,
      // so identical bytes for every mock entry would collapse them all into
      // one import. Entries that should dedup use the same source name.
      return {
        glb: new File([new TextEncoder().encode(entry.name)], entry.name.replace(/\.\w+$/, '.glb')),
        format: 'obj' as const,
      }
    }),
    persistUserGlb: vi.fn(async (_file: File, opts: { name: string }) => {
      if (opts.name === 'Dup')
        return { ok: true as const, def: { id: 'user-dup' }, duplicate: true }
      return { ok: true as const, def: { id: `user-${opts.name}` } }
    }),
  }
})
vi.mock('../furniture/convert/convertModel', () => ({
  ConvertError: FakeConvertError,
  convertModel,
}))
vi.mock('../furniture/upload/persist', () => ({ persistUserGlb }))

import { useStore } from '../state/store'
import { importSh3fResult, libraryNameFromFile } from './openSh3fImport'

const OBJ = new TextEncoder().encode('o cube\nv 0 0 0\n')

function entry(over: Partial<Sh3fEntry> & { name: string }): Sh3fEntry {
  return {
    index: 1,
    catalog: 'PluginFurnitureCatalog.properties',
    category: 'seating',
    width: 0.5,
    depth: 0.5,
    height: 0.9,
    elevation: 0,
    movable: true,
    doorOrWindow: false,
    modelPath: `${over.name}.obj`,
    multiPartModel: false,
    modelFormat: 'obj',
    ...over,
  }
}

function result(entries: Sh3fEntry[], files: Record<string, Uint8Array>): Sh3fParseResult {
  return { libraryName: 'Lib', entries, files, warnings: [] }
}

beforeEach(() => {
  useStore.setState({ userFurniture: [] })
  convertModel.mockClear()
  persistUserGlb.mockClear()
})

describe('importSh3fResult', () => {
  it('imports supported entries, counts duplicates, batch-commits defs', async () => {
    const entries = [
      entry({ name: 'Chair', modelPath: 'chair.obj' }),
      entry({ name: 'Dup', modelPath: 'dup.obj' }),
    ]
    const files = { 'chair.obj': OBJ, 'dup.obj': OBJ }
    const summary = await importSh3fResult(result(entries, files))

    expect(summary.total).toBe(2)
    expect(summary.imported).toBe(1) // Chair (Dup was a duplicate)
    expect(summary.duplicates).toBe(1)
    expect(summary.skipped).toHaveLength(0)
    // A single batch write, not per-item.
    expect(useStore.getState().userFurniture.map((d) => d.id)).toEqual(['user-Chair'])
  })

  it('dedupes byte-identical models WITHIN one batch (locale/variant catalogs)', async () => {
    // Two differently-named entries pointing at the SAME model file — the
    // in-store hash check can't see them (the batch commits once at the end),
    // so the batch-local hash set must collapse them (BUG: sh3f batch dedup).
    const entries = [
      entry({ name: 'Sofa EN', modelPath: 'sofa.obj' }),
      entry({ name: 'Sofa FR', modelPath: 'sofa.obj' }),
    ]
    const summary = await importSh3fResult(result(entries, { 'sofa.obj': OBJ }))
    expect(summary.imported).toBe(1)
    expect(summary.duplicates).toBe(1)
    expect(persistUserGlb).toHaveBeenCalledTimes(1)
  })

  it('skips an unsupported model format with a note', async () => {
    const entries = [
      entry({ name: 'Chair', modelPath: 'chair.obj' }),
      entry({ name: 'Blob', modelPath: 'blob.max', modelFormat: null }),
    ]
    const summary = await importSh3fResult(result(entries, { 'chair.obj': OBJ }))
    expect(summary.imported).toBe(1)
    expect(summary.skipped).toEqual([
      { name: 'Blob', reason: expect.stringContaining('unsupported model format') },
    ])
    expect(convertModel).toHaveBeenCalledTimes(1) // never attempted for Blob
  })

  it('skips an entry whose model bytes are missing from the archive', async () => {
    const entries = [entry({ name: 'Ghost', modelPath: 'ghost.obj' })]
    const summary = await importSh3fResult(result(entries, {})) // no ghost.obj
    expect(summary.imported).toBe(0)
    expect(summary.skipped[0]).toEqual({
      name: 'Ghost',
      reason: 'model file missing from the archive',
    })
  })

  it('skips (does not abort) when a single conversion throws', async () => {
    const entries = [
      entry({ name: 'fail', modelPath: 'fail.obj' }),
      entry({ name: 'Chair', modelPath: 'chair.obj' }),
    ]
    const files = { 'fail.obj': OBJ, 'chair.obj': OBJ }
    const summary = await importSh3fResult(result(entries, files))
    expect(summary.imported).toBe(1)
    expect(summary.skipped).toEqual([{ name: 'fail', reason: 'conversion blew up' }])
  })

  it('passes cm→m footprint + door/window mounted flag through to persist', async () => {
    const entries = [
      entry({
        name: 'Door',
        modelPath: 'door.obj',
        doorOrWindow: true,
        width: 1,
        depth: 0.2,
        height: 2,
      }),
    ]
    await importSh3fResult(result(entries, { 'door.obj': OBJ }))
    expect(persistUserGlb).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        name: 'Door',
        mounted: true,
        footprint: { w: 1, d: 0.2, h: 2 },
        commit: false,
      }),
    )
  })

  it('omits the footprint when a dimension is missing', async () => {
    const entries = [entry({ name: 'Chair', modelPath: 'chair.obj', height: null })]
    await importSh3fResult(result(entries, { 'chair.obj': OBJ }))
    expect(persistUserGlb).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ footprint: undefined }),
    )
  })
})

describe('libraryNameFromFile', () => {
  it('strips the .sh3f extension', () => {
    expect(libraryNameFromFile('eTeks Contributions.sh3f')).toBe('eTeks Contributions')
  })
  it('falls back for an empty name', () => {
    expect(libraryNameFromFile('.sh3f')).toBe('Imported library')
  })
})

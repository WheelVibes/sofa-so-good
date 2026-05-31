import { describe, expect, it } from 'vitest'
import { detectGroups, filesUnder, looseModelFiles } from './detectGroups'

function fileAt(path: string, content: unknown = new Uint8Array(4)): File {
  const data = typeof content === 'string' ? content : (content as BlobPart)
  const name = path.split('/').pop() ?? path
  const f = new File([data], name)
  Object.defineProperty(f, 'webkitRelativePath', { value: path })
  return f
}

function metaFile(path: string, obj: unknown): File {
  return fileAt(path, JSON.stringify(obj))
}

describe('detectGroups', () => {
  it('detects every ikea group in a folder of multiple groups', async () => {
    const files = [
      metaFile('catalog/malm/metadata.json', { group_key: 'malm', variants: [] }),
      fileAt('catalog/malm/white.glb'),
      metaFile('catalog/billy/metadata.json', { group_key: 'billy', variants: [] }),
      fileAt('catalog/billy/white.glb'),
    ]
    const groups = await detectGroups(files)
    expect(groups.map((g) => g.meta.group_key).sort()).toEqual(['billy', 'malm'])
    expect(groups.map((g) => g.dir).sort()).toEqual(['catalog/billy/', 'catalog/malm/'])
  })

  it('returns no groups when no ikea metadata is present', async () => {
    const files = [fileAt('model.glb')]
    expect(await detectGroups(files)).toEqual([])
  })

  it('handles a top-level metadata.json (empty dir prefix)', async () => {
    const files = [metaFile('metadata.json', { group_key: 'solo', variants: [] })]
    const groups = await detectGroups(files)
    expect(groups).toHaveLength(1)
    expect(groups[0].dir).toBe('')
  })
})

describe('filesUnder', () => {
  it('scopes files to a group dir, never leaking same-named files across groups', () => {
    const malmWhite = fileAt('catalog/malm/white.glb')
    const billyWhite = fileAt('catalog/billy/white.glb')
    const files = [malmWhite, billyWhite]
    expect(filesUnder(files, 'catalog/malm/')).toEqual([malmWhite])
    expect(filesUnder(files, 'catalog/billy/')).toEqual([billyWhite])
  })

  it('returns all files for an empty (top-level) dir', () => {
    const files = [fileAt('white.glb'), fileAt('metadata.json')]
    expect(filesUnder(files, '')).toEqual(files)
  })
})

describe('looseModelFiles', () => {
  it('returns model files not under any detected group dir', () => {
    const loose = fileAt('extras/chair.glb')
    const grouped = fileAt('catalog/malm/white.glb')
    const files = [loose, grouped, fileAt('catalog/malm/metadata.json')]
    const groups = [{ dir: 'catalog/malm/', meta: {} }]
    expect(looseModelFiles(files, groups)).toEqual([loose])
  })

  it('ignores non-model files among the loose ones', () => {
    const loose = fileAt('extras/chair.glb')
    const files = [loose, fileAt('extras/readme.txt')]
    expect(looseModelFiles(files, [])).toEqual([loose])
  })
})

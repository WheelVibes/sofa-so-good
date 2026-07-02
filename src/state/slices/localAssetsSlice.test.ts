import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../../features/flags/resolve'
import { localEntryToDef } from './localAssetsSlice'

describe('localEntryToDef', () => {
  it('takes the category from a matching top-level subfolder', () => {
    const def = localEntryToDef({
      relPath: 'seating/foo.glb',
      name: 'Foo',
      bytes: 10,
      subdir: 'seating',
    })
    expect(def.category).toBe('seating')
    expect(def.source).toBe('local')
    expect(def.kind).toBe('gltf')
    expect(def.id).toBe('local:seating/foo.glb')
  })

  it('falls back to a keyword guess when the subfolder is not a category', () => {
    const def = localEntryToDef({
      relPath: 'misc/office_desk.glb',
      name: 'Office Desk',
      bytes: 1,
      subdir: 'misc',
    })
    expect(def.category).toBe('tables') // "desk" → tables
  })

  it('guesses from the name when there is no subfolder', () => {
    const def = localEntryToDef({
      relPath: 'floor_lamp.glb',
      name: 'Floor Lamp',
      bytes: 1,
      subdir: '',
    })
    expect(def.category).toBe('lighting')
  })

  it('infers collision flags from the path', () => {
    const rug = localEntryToDef({
      relPath: 'rug_persian.glb',
      name: 'Rug Persian',
      bytes: 1,
      subdir: '',
    })
    expect(rug.noClip).toBe(true)
    const lamp = localEntryToDef({
      relPath: 'ceiling_lamp.glb',
      name: 'Ceiling Lamp',
      bytes: 1,
      subdir: '',
    })
    expect(lamp.mounted).toBe(true)
  })

  it('URL-encodes each path segment but keeps the slashes', () => {
    const def = localEntryToDef({
      relPath: 'my chairs/arm chair.glb',
      name: 'Arm Chair',
      bytes: 1,
      subdir: 'my chairs',
    })
    expect(def.url).toBe('/@local-assets/file/my%20chairs/arm%20chair.glb')
  })

  it('seeds a placeholder footprint + CC0 license', () => {
    const def = localEntryToDef({ relPath: 'x.glb', name: 'X', bytes: 42, subdir: '' })
    expect(def.defaultFootprint).toEqual({ w: 1, d: 1, h: 1 })
    expect(def.license).toBe('CC0')
    expect(def.byteSize).toBe(42)
  })
})

describe('localAssets feature flag (devOnly, simple tier)', () => {
  it('is ON in dev', () => {
    expect(resolveFlags(true, {}, false, 'simple').localAssets).toBe(true)
    expect(resolveFlags(true, {}, false, 'pro').localAssets).toBe(true)
  })

  it('is forced OFF in production (devOnly), in both modes', () => {
    expect(resolveFlags(false, {}, false, 'simple').localAssets).toBe(false)
    expect(resolveFlags(false, {}, false, 'pro').localAssets).toBe(false)
  })
})

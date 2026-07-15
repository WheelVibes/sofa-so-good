import { describe, expect, it } from 'vitest'
import { BLOCKED_RESOURCE_FALLBACK } from '../gltf/loaderSecurity'
import { parseMtllibNames, resolveSiblingUrl, type SiblingPool } from './loadToObject'

describe('parseMtllibNames (IO-010)', () => {
  it('collects a single mtllib reference', () => {
    expect(parseMtllibNames('mtllib model.mtl\nv 0 0 0\n')).toEqual(['model.mtl'])
  })
  it('collects multiple files listed on one mtllib line', () => {
    expect(parseMtllibNames('mtllib a.mtl b.mtl\n')).toEqual(['a.mtl', 'b.mtl'])
  })
  it('collects files across multiple mtllib lines, de-duplicated + lowercased', () => {
    const obj = 'mtllib First.MTL\no group\nmtllib second.mtl\nmtllib first.mtl\n'
    expect(parseMtllibNames(obj)).toEqual(['first.mtl', 'second.mtl'])
  })
  it('strips any path to the basename', () => {
    expect(parseMtllibNames('mtllib ./mats/wood.mtl\n')).toEqual(['wood.mtl'])
  })
  it('returns empty when there is no mtllib directive', () => {
    expect(parseMtllibNames('v 0 0 0\nf 1 1 1\n')).toEqual([])
  })
})

describe('resolveSiblingUrl (multi-file drag-drop sibling resolution)', () => {
  const pool: SiblingPool = {
    urls: new Map([
      ['scene.gltf', 'blob:https://app/entry-uuid'],
      ['scene.bin', 'blob:https://app/bin-uuid'],
      ['wood.jpg', 'blob:https://app/tex-uuid'],
    ]),
    entryUrl: 'blob:https://app/entry-uuid',
  }

  it('resolves a relative .bin ref that GLTFLoader already resolved against the blob: base to the pool sibling', () => {
    // GLTFLoader turns `scene.bin` into `blob:<origin>/scene.bin` before it
    // reaches the modifier — the old isEmbeddedOrBlobUrl early-return passed
    // this straight through and the sibling was silently lost.
    expect(resolveSiblingUrl(pool, 'blob:https://app/scene.bin')).toBe('blob:https://app/bin-uuid')
  })

  it('resolves a relative texture ref with a subfolder prefix + query by basename', () => {
    expect(resolveSiblingUrl(pool, 'blob:https://app/textures/wood.jpg?v=1')).toBe(
      'blob:https://app/tex-uuid',
    )
  })

  it('leaves genuine data: URIs untouched', () => {
    const dataUri = 'data:application/octet-stream;base64,AAAA'
    expect(resolveSiblingUrl(pool, dataUri)).toBe(dataUri)
  })

  it("leaves the entry's own blob object URL untouched", () => {
    expect(resolveSiblingUrl(pool, 'blob:https://app/entry-uuid')).toBe(
      'blob:https://app/entry-uuid',
    )
  })

  it("leaves a sibling's own minted object URL untouched", () => {
    expect(resolveSiblingUrl(pool, 'blob:https://app/bin-uuid')).toBe('blob:https://app/bin-uuid')
  })

  it('blocks a foreign / unknown ref to the blank fallback (SEC-1 closed allowlist)', () => {
    expect(resolveSiblingUrl(pool, 'https://attacker.example/beacon.png')).toBe(
      BLOCKED_RESOURCE_FALLBACK,
    )
    expect(resolveSiblingUrl(pool, 'blob:https://app/not-a-sibling.png')).toBe(
      'blob:https://app/not-a-sibling.png',
    )
  })
})

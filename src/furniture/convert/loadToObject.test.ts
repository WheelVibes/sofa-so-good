import { describe, expect, it } from 'vitest'
import { parseMtllibNames } from './loadToObject'

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

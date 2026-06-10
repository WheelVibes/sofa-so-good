import { describe, expect, it } from 'vitest'
import {
  decodeFinishDrag,
  encodeFinishDrag,
  type FinishDropTarget,
  resolveFinishDrop,
} from './finishDrop'

describe('finish drag payload', () => {
  it('round-trips a payload through encode/decode', () => {
    const p = { finishId: 'oak', label: 'Oak' }
    expect(decodeFinishDrag(encodeFinishDrag(p))).toEqual(p)
  })

  it('decodes a payload without a label', () => {
    expect(decodeFinishDrag('{"finishId":"mat:wood01"}')).toEqual({ finishId: 'mat:wood01' })
  })

  it('returns null for empty / malformed / foreign data', () => {
    expect(decodeFinishDrag(null)).toBeNull()
    expect(decodeFinishDrag('')).toBeNull()
    expect(decodeFinishDrag('not json')).toBeNull()
    expect(decodeFinishDrag('{"foo":1}')).toBeNull()
    expect(decodeFinishDrag('{"finishId":""}')).toBeNull()
    expect(decodeFinishDrag('42')).toBeNull()
  })

  it('drops a non-string label rather than passing it through', () => {
    expect(decodeFinishDrag('{"finishId":"oak","label":3}')).toEqual({ finishId: 'oak' })
  })
})

describe('resolveFinishDrop', () => {
  const oak = { finishId: 'oak' }
  it('routes floor / wall / item targets to the matching action', () => {
    expect(resolveFinishDrop({ kind: 'floor', roomId: 'living' }, oak)).toEqual({
      type: 'floor',
      roomId: 'living',
      finishId: 'oak',
    })
    expect(resolveFinishDrop({ kind: 'wall', roomId: 'living' }, oak)).toEqual({
      type: 'wall',
      roomId: 'living',
      finishId: 'oak',
    })
    expect(resolveFinishDrop({ kind: 'item', itemId: 'i1' }, oak)).toEqual({
      type: 'item',
      itemId: 'i1',
      finishId: 'oak',
    })
  })

  it('no-ops on a missing target, payload, or id', () => {
    expect(resolveFinishDrop(null, oak)).toBeNull()
    expect(resolveFinishDrop({ kind: 'item', itemId: 'i1' }, null)).toBeNull()
    expect(resolveFinishDrop({ kind: 'item', itemId: 'i1' }, { finishId: '' })).toBeNull()
    expect(resolveFinishDrop({ kind: 'floor', roomId: '' }, oak)).toBeNull()
    expect(resolveFinishDrop({ kind: 'wall', roomId: '' }, oak)).toBeNull()
    expect(resolveFinishDrop({ kind: 'item', itemId: '' }, oak)).toBeNull()
  })

  it('passes a mat:<id> DLC finish straight through', () => {
    const target: FinishDropTarget = { kind: 'item', itemId: 'sofa1' }
    expect(resolveFinishDrop(target, { finishId: 'mat:ConcreteWall' })).toEqual({
      type: 'item',
      itemId: 'sofa1',
      finishId: 'mat:ConcreteWall',
    })
  })
})

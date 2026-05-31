import { describe, expect, it } from 'vitest'
import { createLineSplitter, parseEvent } from './progress.mjs'

describe('parseEvent', () => {
  it('parses a per-product event', () => {
    expect(
      parseEvent(
        '{"group":"g","finish":"white","glb":"white.glb","phase":"glb_written","done":1,"total":3}',
      ),
    ).toEqual({
      group: 'g',
      finish: 'white',
      glb: 'white.glb',
      phase: 'glb_written',
      done: 1,
      total: 3,
    })
  })
  it('returns null for non-JSON / blank lines', () => {
    expect(parseEvent('')).toBeNull()
    expect(parseEvent('[+] Content up to date.')).toBeNull()
  })
})

describe('createLineSplitter', () => {
  it('emits complete lines across chunk boundaries', () => {
    const seen = []
    const feed = createLineSplitter((line) => seen.push(line))
    feed('{"a":1}\n{"b":')
    feed('2}\n')
    expect(seen).toEqual(['{"a":1}', '{"b":2}'])
  })
  it('flushes a trailing partial line on end()', () => {
    const seen = []
    const feed = createLineSplitter((line) => seen.push(line))
    feed('{"c":3}')
    feed.end()
    expect(seen).toEqual(['{"c":3}'])
  })
})

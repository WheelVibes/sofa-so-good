import { beforeEach, describe, expect, it } from 'vitest'
import { getMeta, putAsset, resetCacheForTest } from './db'
import { evictUntilUnder } from './lru'

const big = (n: number) => new Blob([new Uint8Array(n)])

describe('lru.evictUntilUnder', () => {
  beforeEach(async () => {
    await resetCacheForTest()
  })

  it('drops oldest entries until total bytes <= cap', async () => {
    await putAsset('a', { kind: 'material', channels: { c: big(1000) } })
    await new Promise((r) => setTimeout(r, 5))
    await putAsset('b', { kind: 'material', channels: { c: big(1000) } })
    await new Promise((r) => setTimeout(r, 5))
    await putAsset('c', { kind: 'material', channels: { c: big(1000) } })

    await evictUntilUnder(2000)
    const meta = await getMeta()
    expect(meta.totalBytes).toBeLessThanOrEqual(2000)
    expect(meta.entries.find((e) => e.key === 'a')).toBeUndefined()
  })
})

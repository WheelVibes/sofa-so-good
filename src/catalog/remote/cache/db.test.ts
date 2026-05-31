import { beforeEach, describe, expect, it } from 'vitest'
import type { AssetBundle, RemoteEntry } from '../types'
import {
  getAsset,
  getIndex,
  getMeta,
  getThumb,
  putAsset,
  putIndex,
  putThumb,
  resetCacheForTest,
} from './db'

const blob = (s: string) => new Blob([s])

const sampleEntry: RemoteEntry = {
  provider: 'polyhaven',
  slug: 'a',
  kind: 'material',
  name: 'A',
  category: 'floor',
  thumbUrl: '',
  resolutions: ['2k'],
  attribution: '',
  sourceUrl: '',
}

const sampleBundle: AssetBundle = {
  kind: 'material',
  channels: { albedo: blob('x') },
}

describe('cache/db', () => {
  beforeEach(async () => {
    await resetCacheForTest()
  })

  it('round-trips an asset', async () => {
    await putAsset('polyhaven:a:2k', sampleBundle)
    const got = await getAsset('polyhaven:a:2k')
    expect(got?.kind).toBe('material')
  })

  it('round-trips a thumbnail', async () => {
    await putThumb('polyhaven:a', blob('t'))
    const got = await getThumb('polyhaven:a')
    expect(got).toBeInstanceOf(Blob)
  })

  it('round-trips an index', async () => {
    await putIndex('polyhaven', [sampleEntry])
    const got = await getIndex('polyhaven')
    expect(got?.entries).toHaveLength(1)
    expect(got?.fetchedAt).toBeTruthy()
  })

  it('tracks meta byte totals on asset writes', async () => {
    await putAsset('polyhaven:a:2k', sampleBundle)
    const meta = await getMeta()
    expect(meta.totalBytes).toBeGreaterThan(0)
    expect(meta.entries.find((e) => e.key === 'polyhaven:a:2k')).toBeDefined()
  })
})

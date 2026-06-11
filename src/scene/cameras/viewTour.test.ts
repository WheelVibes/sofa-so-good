import { describe, expect, it } from 'vitest'
import type { SavedView } from '../../state/slices/cameraViewsSlice'
import { viewTourFrames } from './viewTour'

const view = (over: Partial<SavedView>): SavedView => ({
  id: 'v',
  name: 'V',
  pos: [1, 2, 3],
  target: [0, 0, 0],
  ...over,
})

describe('viewTourFrames', () => {
  it('returns frames in saved order with lighting carried', () => {
    const frames = viewTourFrames([
      view({ id: 'a', mode: 'manual', hour: 18, lights: 'on' }),
      view({ id: 'b', pos: [4, 5, 6] }),
    ])
    expect(frames).toHaveLength(2)
    expect(frames?.[0]).toMatchObject({ pos: [1, 2, 3], hour: 18, lights: 'on' })
  })

  it('skips malformed poses and needs at least 2 usable views', () => {
    expect(viewTourFrames([view({})])).toBeNull()
    expect(
      viewTourFrames([view({ id: 'a' }), view({ id: 'bad', pos: [Number.NaN, 0, 0] })]),
    ).toBeNull()
    const frames = viewTourFrames([
      view({ id: 'a' }),
      view({ id: 'bad', pos: [Number.NaN, 0, 0] }),
      view({ id: 'c', pos: [7, 8, 9] }),
    ])
    expect(frames?.map((f) => f.pos)).toEqual([
      [1, 2, 3],
      [7, 8, 9],
    ])
  })
})

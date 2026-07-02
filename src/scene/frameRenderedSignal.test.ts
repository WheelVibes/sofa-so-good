import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetFrameRenderedSignal,
  notifyFrameRendered,
  onFrameRendered,
} from './frameRenderedSignal'

beforeEach(() => {
  _resetFrameRenderedSignal()
})

describe('frameRenderedSignal', () => {
  it('notifies every subscriber once per rendered frame', () => {
    let a = 0
    let b = 0
    onFrameRendered(() => a++)
    onFrameRendered(() => b++)
    notifyFrameRendered()
    notifyFrameRendered()
    expect(a).toBe(2)
    expect(b).toBe(2)
  })

  it('stops notifying after unsubscribe', () => {
    let n = 0
    const off = onFrameRendered(() => n++)
    notifyFrameRendered()
    off()
    notifyFrameRendered()
    expect(n).toBe(1)
  })

  it('tolerates a listener unsubscribing itself mid-notify', () => {
    let n = 0
    const off = onFrameRendered(() => {
      n++
      off()
    })
    notifyFrameRendered()
    notifyFrameRendered()
    expect(n).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  ASSETS_SETTLE_TAIL_MS,
  assetsSettleDirtyUntil,
  isContinuous,
  OVERLAY_RENDER_MS,
  type PumpInputs,
  settleTailMs,
  shouldRender,
} from './renderDecision'

const base: PumpInputs = {
  hidden: false,
  sceneReady: true,
  assetsActive: false,
  walk: false,
  autoRotate: false,
  touring: false,
  recording: false,
  showcaseAccumulating: false,
  dragging: false,
  animatedCount: 0,
  now: 1000,
  dirtyUntil: 0,
  overlayTransition: false,
  overlayBoot: false,
  lastOverlayRenderMs: 0,
}

describe('shouldRender', () => {
  it('does not render an idle, settled, fully-loaded scene', () => {
    expect(shouldRender(base)).toBe(false)
    expect(isContinuous(base)).toBe(false)
  })

  it('never renders while the tab is hidden — even mid-animation', () => {
    expect(shouldRender({ ...base, hidden: true, walk: true })).toBe(false)
    expect(shouldRender({ ...base, hidden: true, animatedCount: 3 })).toBe(false)
    expect(shouldRender({ ...base, hidden: true, sceneReady: false })).toBe(false)
  })

  it('renders continuously during boot and while assets stream', () => {
    expect(shouldRender({ ...base, sceneReady: false })).toBe(true)
    expect(shouldRender({ ...base, assetsActive: true })).toBe(true)
  })

  it('warms the scene at a throttled rate while the transition overlay is up', () => {
    const t = { ...base, overlayTransition: true, lastOverlayRenderMs: 1000 }
    // Within the throttle window: no frame (loader animation keeps its budget).
    expect(shouldRender({ ...t, now: 1030 })).toBe(false)
    expect(shouldRender({ ...t, now: 1030, walk: true })).toBe(false)
    // Past the window: a warm frame renders even for an idle, settled scene —
    // this is the frame the readiness-based hide waits for.
    expect(shouldRender({ ...t, now: 1000 + OVERLAY_RENDER_MS })).toBe(true)
    expect(shouldRender({ ...t, now: 1000 + OVERLAY_RENDER_MS, sceneReady: false })).toBe(true)
  })

  it('never renders while hidden, even with the transition overlay up', () => {
    expect(
      shouldRender({
        ...base,
        hidden: true,
        overlayTransition: true,
        now: 1000 + OVERLAY_RENDER_MS,
      }),
    ).toBe(false)
  })

  it('throttles boot-time WebGL while the boot overlay is up', () => {
    const boot = { ...base, sceneReady: false, overlayBoot: true, lastOverlayRenderMs: 1000 }
    expect(shouldRender({ ...boot, now: 1030 })).toBe(false)
    expect(shouldRender({ ...boot, now: 1000 + OVERLAY_RENDER_MS })).toBe(true)
  })

  it.each([
    ['walk', { walk: true }],
    ['autoRotate', { autoRotate: true }],
    ['touring', { touring: true }],
    ['recording', { recording: true }],
    ['showcaseAccumulating', { showcaseAccumulating: true }],
    ['dragging', { dragging: true }],
  ])('renders continuously while %s is active', (_label, patch) => {
    expect(shouldRender({ ...base, ...patch })).toBe(true)
    expect(isContinuous({ ...base, ...patch })).toBe(true)
  })

  it('renders continuously while a fan (animated source) is present', () => {
    expect(shouldRender({ ...base, animatedCount: 1 })).toBe(true)
    expect(isContinuous({ ...base, animatedCount: 1 })).toBe(true)
  })

  it('renders during the settle tail after a discrete change, then stops', () => {
    expect(shouldRender({ ...base, now: 1000, dirtyUntil: 1300 })).toBe(true)
    expect(shouldRender({ ...base, now: 1300, dirtyUntil: 1300 })).toBe(false)
    expect(shouldRender({ ...base, now: 1301, dirtyUntil: 1300 })).toBe(false)
  })
})

describe('settleTailMs', () => {
  it('is longer on showcase tiers to bridge into shadow accumulation', () => {
    expect(settleTailMs(true)).toBeGreaterThan(settleTailMs(false))
    expect(settleTailMs(false)).toBeGreaterThanOrEqual(300)
  })
})

describe('assetsSettleDirtyUntil', () => {
  it('grants a tail when asset streaming ends', () => {
    expect(assetsSettleDirtyUntil(true, false, 5000, 0)).toBe(5000 + ASSETS_SETTLE_TAIL_MS)
  })

  it('leaves the deadline alone while streaming, and when it never was', () => {
    expect(assetsSettleDirtyUntil(true, true, 5000, 120)).toBe(120)
    expect(assetsSettleDirtyUntil(false, false, 5000, 120)).toBe(120)
    expect(assetsSettleDirtyUntil(false, true, 5000, 120)).toBe(120)
  })

  it('never shortens a later deadline already in flight', () => {
    const later = 9000
    expect(assetsSettleDirtyUntil(true, false, 5000, later)).toBe(later)
  })

  it('makes the tick after the falling edge render', () => {
    // The last continuous frame was the tick that still saw `assetsActive`; a
    // surface that suspended commits its material after that (FINISH-DEFER).
    const now = 5000
    const dirtyUntil = assetsSettleDirtyUntil(true, false, now, 0)
    expect(shouldRender({ ...base, now: now + 16, assetsActive: false, dirtyUntil })).toBe(true)
    expect(
      shouldRender({
        ...base,
        now: now + ASSETS_SETTLE_TAIL_MS + 1,
        assetsActive: false,
        dirtyUntil,
      }),
    ).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
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

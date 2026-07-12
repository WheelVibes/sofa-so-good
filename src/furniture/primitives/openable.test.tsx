// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * CABINET-OPEN unmount leak (openable.tsx). `useOpenEase` acquires a
 * `registerAnimatedSource()` hold on the first moving frame and releases it when
 * the sweep completes. If the primitive unmounts mid-sweep (cabinet removed /
 * hidden while opening) the hold must still be released — otherwise it leaks a
 * RenderPump registration and the demand loop never settles.
 *
 * The real `HingedDoor`/`SlideDrawer` need a live R3F Canvas (WebGL) to resolve
 * their three-object refs, which happy-dom can't provide, so we exercise the
 * shared `useOpenEase` hook directly with a no-op `apply` and a mocked
 * `useFrame` (captures the per-frame callback) / `useThree` (stub invalidate).
 */
let frameCb: ((state: unknown, dt: number) => void) | null = null
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb: (state: unknown, dt: number) => void) => {
    frameCb = cb
  },
  useThree: (selector: (s: { invalidate: () => void }) => unknown) =>
    selector({ invalidate: () => {} }),
}))

import { __resetAnimatedSources, animatedSourceCount } from '../../scene/animatedSources'
import { useOpenEase } from './openable'

function Harness({ open }: { open: boolean }) {
  useOpenEase(open, () => {})
  return null
}

afterEach(() => {
  frameCb = null
  __resetAnimatedSources()
})

describe('useOpenEase — animated-source hold lifecycle', () => {
  it('releases the hold on unmount mid-animation (count returns to 0)', () => {
    // Mount closed: raw progress already at the target → no hold acquired.
    const { rerender, unmount } = render(<Harness open={false} />)
    expect(animatedSourceCount()).toBe(0)

    // Begin opening → the next frame sees cur !== target and acquires the hold.
    rerender(<Harness open />)
    act(() => frameCb?.(null, 0.05))
    expect(animatedSourceCount()).toBe(1)

    // Unmount BEFORE the sweep completes — the cleanup must release the hold.
    unmount()
    expect(animatedSourceCount()).toBe(0)
  })

  it('releases the hold normally when the sweep completes', () => {
    const { rerender } = render(<Harness open={false} />)
    rerender(<Harness open />)
    act(() => frameCb?.(null, 0.05))
    expect(animatedSourceCount()).toBe(1)
    // A huge dt snaps raw progress to the target → the frame releases the hold.
    act(() => frameCb?.(null, 999))
    expect(animatedSourceCount()).toBe(0)
  })
})

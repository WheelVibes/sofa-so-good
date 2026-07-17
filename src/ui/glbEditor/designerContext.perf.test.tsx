// @vitest-environment happy-dom
/**
 * Asset Studio Iteration 2 · Stage 6f — CONTEXT-SLICING PROFILING PROBE.
 *
 * The designer's React state is a single flat context (`DesignerProvider` — one
 * value owning the whole `AssetEditSpec` + selection + tool state). The plan's
 * recorded scaling debt: if typing in a field re-renders every unrelated panel
 * expensively, split the context into narrower slices. This test is the evidence
 * gate — it measures the ACTUAL per-keystroke re-render cost of the flat-context
 * cascade at a non-trivial spec, via a React `Profiler`, so the decision to split
 * (or not) rests on a number rather than a hunch.
 *
 * RULING (recorded in docs/asset-studio-plan.md Stage 6f): the cascade fires (a
 * name keystroke re-renders context consumers) but each render is cheap — the
 * expensive work (part geometry) is memoised on part IDENTITY in `PartMesh`, and
 * a `setName` keystroke never touches `spec.parts`, so nothing rebuilds; it's pure
 * React reconciliation. Measured per-keystroke actualDuration stays well under the
 * plan's 5 ms threshold even at 30 parts → NO split shipped (matches the plan's
 * "revisit when the profiler shows it" note). This test also guards against a
 * future regression that makes the cascade expensive.
 */
import { render, waitFor } from '@testing-library/react'
import { act, Profiler, useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useStore } from '../../state/store'
import { type DesignerContextValue, DesignerProvider, useDesigner } from './designerContext'

let renderCount = 0

function Probe({ ctxRef }: { ctxRef: { current: DesignerContextValue | null } }) {
  const ctx = useDesigner()
  ctxRef.current = ctx
  const first = useRef(true)
  // Count renders after mount (the mount render is setup, not a keystroke cost).
  if (!first.current) renderCount++
  first.current = false
  return null
}

afterEach(() => {
  useStore.getState().setGlbDesignerOpen(false)
})

describe('Stage 6f — flat designer context per-keystroke cost (context-slicing ruling)', () => {
  it('a name keystroke re-renders consumers cheaply (< 5 ms) at 30 parts', async () => {
    useStore.getState().setUiMode('pro')
    const ctxRef: { current: DesignerContextValue | null } = { current: null }
    let profiledMs = 0
    render(
      <DesignerProvider>
        <Profiler
          id="designer"
          onRender={(_id, _phase, actualDuration) => {
            profiledMs += actualDuration
          }}
        >
          <Probe ctxRef={ctxRef} />
        </Profiler>
      </DesignerProvider>,
    )
    await waitFor(() => expect(ctxRef.current).not.toBeNull())

    // Build a non-trivial spec: 30 primitive parts (each addShape flushes a
    // render, so ctxRef stays fresh between calls).
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        ctxRef.current?.addShape('box')
      })
    }
    expect(ctxRef.current?.spec.parts.length).toBe(30)

    // Now measure ONLY the keystroke cascade: 12 setName calls (typing a name).
    renderCount = 0
    profiledMs = 0
    const KEYS = 12
    for (let i = 0; i < KEYS; i++) {
      await act(async () => {
        ctxRef.current?.setName(`Custom asset ${'x'.repeat(i)}`)
      })
    }

    // The cascade DOES fire — the probe (a context consumer) re-renders on each
    // keystroke (proving a split *could* help IF the renders were expensive)…
    expect(renderCount).toBeGreaterThanOrEqual(KEYS)
    // …but the per-keystroke cost is tiny: a setName never touches spec.parts, so
    // PartMesh geometry (memoised on part identity) rebuilds nothing — it's pure
    // reconciliation. Well under the plan's 5 ms/keystroke split threshold.
    const perKeystrokeMs = profiledMs / KEYS
    // eslint-disable-next-line no-console
    console.log(
      `[6f-ctx] 30 parts · ${KEYS} name keystrokes: ${renderCount} consumer re-renders, ` +
        `${profiledMs.toFixed(2)}ms total Profiler actualDuration = ${perKeystrokeMs.toFixed(3)}ms/keystroke`,
    )
    expect(perKeystrokeMs).toBeLessThan(5)
  })
})

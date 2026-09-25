import { memo } from 'react'
import { createPortal } from 'react-dom'
import { shouldReduceMotion } from '../motionPreference'
import { FADE_MS, useOverlayLifecycle } from './useOverlayLifecycle'

/**
 * The mid-session quality-tier-change veil (TIER-CHANGE-VEIL, S2 residual in
 * `docs/audit/interaction-sweep-2026-09-18.md`). Replaces the boot-branded
 * `LoadingOverlay` ("Sofa So Good / Applying … quality…") that used to cover the whole
 * viewport for ~3s while `setQualityTier`'s shader-recompile burst runs -- a real tier
 * switch mid-session is not "entering the app", so it shouldn't look like boot.
 *
 * Driven by `uiSlice.ts`'s existing `loading` state (behind the `tierChangeVeil` flag;
 * with it off, `setQualityTier` sets `loading.kind: 'branded'` and `App.tsx` renders the
 * old `LoadingOverlay` instead). Deliberately reuses `loading.active`/`hideLoading` --
 * NOT a fixed timer like `ModeSwitchCrossfade` -- because the compile burst is real work
 * (measured 950-2167ms) that a short timer would cut off mid-compile; `App.tsx`'s
 * `scheduleTransitionHide` already holds this open until the first post-switch rendered
 * frame (`sceneReady`/`onFrameRendered`) before calling `hideLoading`. `useOverlayLifecycle`
 * (the SAME min-visible+fade timeline `LoadingOverlay` uses) then shapes the visible
 * duration from that `active` edge, so the two overlays hide the same way -- only the DOM
 * differs. Carries `data-transition-overlay` for parity with `LoadingOverlay`: the whole
 * scenario corpus (`scenarioTransitionGuard.test.ts`) waits on that attribute alone, so any
 * scenario that exercises a tier change keeps working unchanged under either flag state.
 *
 * `prefers-reduced-motion`: unlike `ModeSwitchCrossfade` (which skips its whole veil), this
 * one still mounts -- a tier change is real work with a real duration, not a decorative
 * transition, so the user still needs the caption. Reduced motion only strips the opacity
 * fade and the indeterminate bar's sweep animation ("caption without fade").
 */
export const TierChangeVeil = memo(function TierChangeVeil({
  active,
  label,
}: {
  active: boolean
  label: string
}) {
  const { mounted, fading } = useOverlayLifecycle(active)
  const reducedMotion = shouldReduceMotion()
  if (!mounted) return null

  return createPortal(
    <div
      aria-live="polite"
      aria-busy={active}
      role="status"
      // See `LoadingOverlay.tsx`'s identical comment -- this is the automation hook the
      // visual harness (and `scenarioTransitionGuard.test.ts`) waits on, not decoration.
      data-transition-overlay=""
      data-tier-change-veil=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--s-3)',
        background: 'radial-gradient(120% 90% at 50% 30%, var(--scene-a), var(--scene-b) 75%)',
        opacity: fading ? 0 : 1,
        transition: reducedMotion ? 'none' : `opacity ${FADE_MS}ms ease`,
        pointerEvents: active ? 'auto' : 'none',
      }}
    >
      <style>{BAR_KEYFRAMES}</style>
      <div style={{ fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--text-3)' }}>
        {label}
      </div>
      <div
        aria-hidden="true"
        style={{
          width: 120,
          height: 4,
          borderRadius: 2,
          overflow: 'hidden',
          background: 'var(--surface-3)',
        }}
      >
        <div
          className={reducedMotion ? undefined : 'tier-veil-bar-fill'}
          style={{
            height: '100%',
            width: reducedMotion ? '100%' : '40%',
            borderRadius: 2,
            background: 'var(--accent)',
          }}
        />
      </div>
    </div>,
    document.body,
  )
})

const BAR_KEYFRAMES = `
@keyframes tier-veil-sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
.tier-veil-bar-fill { animation: tier-veil-sweep 1.1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .tier-veil-bar-fill { animation: none; width: 100%; }
}
`

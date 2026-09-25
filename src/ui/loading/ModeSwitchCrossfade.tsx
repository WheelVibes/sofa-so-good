import { memo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../state/store'
import { shouldReduceMotion } from '../motionPreference'
import { MODE_CROSSFADE_MS, useModeSwitchCrossfade } from './modeCrossfadeTimeline'

/**
 * The orbit<->walk mode-switch veil (MODE-SWITCH-CROSSFADE, N3). Replaces the branded
 * boot-splash `LoadingOverlay` used to raise on every `setCameraMode` call with a plain,
 * unbranded opacity dip -- no logo, no room illustration, no label -- so a mode toggle
 * reads as a quick cross-fade of the render rather than a trip back to the boot screen.
 *
 * Driven by `cameraSlice.ts`'s `modeTransition` (behind the `modeSwitchCrossfade` flag;
 * with it off, `setCameraMode` raises the old `LoadingOverlay` splash instead and this
 * component stays permanently unmounted, `active` never true). Timing lives in the pure,
 * unit-tested `useModeSwitchCrossfade` hook; this component only wires the store to it and
 * calls `endModeTransition()` once the veil has finished, so `modeTransition.active` never
 * gets stuck true.
 *
 * `prefers-reduced-motion` is read once per mount (matches `useAmbientFx`/
 * `useCollapseTransition`'s existing pattern) -- the hook itself skips the whole timeline
 * when it is set, so the switch is instant with no dip at all.
 */
export const ModeSwitchCrossfade = memo(function ModeSwitchCrossfade() {
  const nonce = useStore((s) => s.modeTransition.nonce)
  const endModeTransition = useStore((s) => s.endModeTransition)
  const reducedMotion = shouldReduceMotion()
  const { mounted, fading } = useModeSwitchCrossfade(nonce, reducedMotion)

  const wasMounted = useRef(false)
  useEffect(() => {
    if (wasMounted.current && !mounted) endModeTransition()
    wasMounted.current = mounted
  }, [mounted, endModeTransition])

  // Reduced motion: the hook never mounts the veil at all (verified live, CDP
  // `Emulation.setEmulatedMedia`), so the `mounted` true->false edge above never fires and
  // `modeTransition.active` would otherwise stay stuck true forever after the FIRST switch of
  // a reduced-motion session. React to the nonce directly instead -- it changes on every real
  // switch regardless of whether the veil ever mounts.
  const lastNonce = useRef(nonce)
  useEffect(() => {
    if (nonce === lastNonce.current) return
    lastNonce.current = nonce
    if (reducedMotion) endModeTransition()
  }, [nonce, reducedMotion, endModeTransition])

  if (!mounted) return null

  return createPortal(
    <div
      aria-hidden="true"
      data-mode-crossfade=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        pointerEvents: 'none',
        background: 'radial-gradient(120% 90% at 50% 30%, var(--scene-a), var(--scene-b) 75%)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${MODE_CROSSFADE_MS}ms ease`,
      }}
    />,
    document.body,
  )
})

import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('loading overlay state', () => {
  beforeEach(() => {
    useStore.setState({
      bootPhase: 'hydrating',
      loading: { active: false, label: '', kind: 'branded' },
      roomEditor: { active: false, roomId: null },
      cameraMode: 'orbit',
      modeTransition: { active: false, nonce: 0 },
    })
  })

  it('setBootReady flips bootPhase to ready', () => {
    useStore.getState().setBootReady()
    expect(useStore.getState().bootPhase).toBe('ready')
  })

  it('showLoading / hideLoading toggle the transition overlay', () => {
    useStore.getState().showLoading('Entering walkthrough…')
    expect(useStore.getState().loading).toEqual({
      active: true,
      label: 'Entering walkthrough…',
      kind: 'branded',
    })
    useStore.getState().hideLoading()
    // Label + kind preserved while it fades out; only active clears.
    expect(useStore.getState().loading).toEqual({
      active: false,
      label: 'Entering walkthrough…',
      kind: 'branded',
    })
  })

  it('showLoading defaults to kind "branded", and accepts "veil" explicitly (TIER-CHANGE-VEIL)', () => {
    useStore.getState().showLoading('Applying Realistic quality…', 'veil')
    expect(useStore.getState().loading).toEqual({
      active: true,
      label: 'Applying Realistic quality…',
      kind: 'veil',
    })
  })

  it('setCameraMode no longer raises the branded overlay by default (MODE-SWITCH-CROSSFADE) — it bumps modeTransition instead, only on a real change', () => {
    useStore.getState().setCameraMode('orbit') // no change
    expect(useStore.getState().loading.active).toBe(false)
    expect(useStore.getState().modeTransition.active).toBe(false)

    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().loading.active).toBe(false)
    expect(useStore.getState().modeTransition.active).toBe(true)
  })

  it('setCameraMode falls back to the branded overlay with modeSwitchCrossfade OFF (A/B path)', () => {
    useStore.getState().setFeatureFlag('modeSwitchCrossfade', false)
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().loading.active).toBe(true)
    expect(useStore.getState().loading.label).toMatch(/walkthrough/i)
    expect(useStore.getState().modeTransition.active).toBe(false)
    useStore.getState().setFeatureFlag('modeSwitchCrossfade', true)
  })

  it('setCameraMode does not show the overlay inside the room editor', () => {
    useStore.setState({ roomEditor: { active: true, roomId: 'bedroom2' } })
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().loading.active).toBe(false)
  })

  it('room editor enter/exit set a labelled transition overlay', () => {
    useStore.getState().enterRoomEditor('bedroom2')
    expect(useStore.getState().loading).toEqual({
      active: true,
      label: 'Entering room…',
      kind: 'branded',
    })

    useStore.getState().exitRoomEditor()
    expect(useStore.getState().loading).toEqual({
      active: true,
      label: 'Exiting room…',
      kind: 'branded',
    })
  })

  it('setQualityTier shows the overlay only on a real tier change', () => {
    useStore.setState({ qualityTier: 'performance', qualityUserSet: false })
    useStore.getState().setQualityTier('performance') // no change
    expect(useStore.getState().loading.active).toBe(false)

    useStore.getState().setQualityTier('realistic')
    expect(useStore.getState().qualityTier).toBe('realistic')
    expect(useStore.getState().loading.active).toBe(true)
    expect(useStore.getState().loading.label).toMatch(/realistic/i)
  })

  it('re-selecting the already-active quality tier never flashes the overlay', () => {
    useStore.getState().setQualityTier('performance')
    useStore.getState().hideLoading()
    useStore.getState().setQualityTier('performance') // already active — must be a no-op
    expect(useStore.getState().loading.active).toBe(false)
  })

  it('setQualityTier defaults to the unbranded veil (TIER-CHANGE-VEIL, S2 residual)', () => {
    useStore.setState({ qualityTier: 'performance', qualityUserSet: false })
    useStore.getState().setQualityTier('realistic')
    expect(useStore.getState().loading.kind).toBe('veil')
    expect(useStore.getState().loading.label).toMatch(/realistic/i)
  })

  it('setQualityTier falls back to the branded splash with tierChangeVeil OFF (A/B path)', () => {
    useStore.setState({ qualityTier: 'performance', qualityUserSet: false })
    useStore.getState().setFeatureFlag('tierChangeVeil', false)
    useStore.getState().setQualityTier('realistic')
    expect(useStore.getState().loading.kind).toBe('branded')
    expect(useStore.getState().loading.active).toBe(true)
    useStore.getState().setFeatureFlag('tierChangeVeil', true)
  })

  it('a mode switch never sets loading.kind to "veil" (the two flags are independent)', () => {
    useStore.getState().setFeatureFlag('modeSwitchCrossfade', false)
    useStore.getState().setCameraMode('firstPerson')
    expect(useStore.getState().loading.kind).toBe('branded')
    useStore.getState().setFeatureFlag('modeSwitchCrossfade', true)
  })

  // W15 (walk-photoreal review, 2026-09-19): a desktop-metal walk frame at 18:30 caught the
  // BOOT-branded splash ("Sofa So Good — Almost ready…") covering a live walk session ~4s after
  // a `setLightsMode('on')`. Investigated exhaustively: the exact phrase "Almost ready…" is
  // pinned ONLY on the static `#boot-loader` DOM node (`App.tsx`'s `stopBootPhraseRotator('Almost
  // ready…')`) and never appears in `loadingPhrases.json` (the React `LoadingOverlay`/
  // `TierChangeVeil`'s own phrase pool), so the captured frame is that static cover reappearing —
  // which requires a real page reload, not a `loading.kind`/`showLoading` misfire. A full audit of
  // every `showLoading` call site (`cameraSlice.setCameraMode`, `uiSlice.enterRoomEditor`/
  // `exitRoomEditor`/`setQualityTier`, `floorPlanSlice.setFloorPlanEditing`/
  // `toggleFloorPlanEditing`) found none reachable from `setLightsMode`, `setManualHour` or
  // `setTimeMode` — every one is gated behind an explicit user action (room/plan editor,
  // quality-tier or camera-mode change) or an explicitly-disabled default-on A/B flag, matching
  // the existing tests above. This locks that invariant in: a clock or lights change must never
  // touch the transition overlay, so a future change can't reintroduce the coupling the review
  // suspected. (The most likely real cause, per `docs/visual-verification-playbook.md`'s own
  // documented gotcha, is a concurrent agent's dev-server restart during the review session —
  // outside this store entirely.)
  it('a lights/clock change never touches the transition overlay (W15 investigation)', () => {
    useStore.setState({ loading: { active: false, label: '', kind: 'branded' } })
    useStore.getState().setLightsMode('on')
    useStore.getState().setManualHour(18.5)
    useStore.getState().setTimeMode('manual')
    useStore.getState().setLightsMode('off')
    expect(useStore.getState().loading).toEqual({ active: false, label: '', kind: 'branded' })
  })
})

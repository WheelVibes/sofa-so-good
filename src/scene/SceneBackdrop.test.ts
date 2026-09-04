import { describe, expect, it } from 'vitest'
import { resolveFlags } from '../features/featureFlags'
import { UI_INITIAL } from '../state/slices/uiSlice'
import { useStore } from '../state/store'
import { BACKDROP_PRESETS } from './backdropEquirect'
import { BACKDROPS, backdropVisibleNow, isPhotoBackdropActive } from './SceneBackdrop'

describe('isPhotoBackdropActive', () => {
  it('is active only in walk mode for a real photo preset', () => {
    expect(isPhotoBackdropActive('city', 'firstPerson')).toBe(true)
    expect(isPhotoBackdropActive('dusk', 'firstPerson')).toBe(true)
  })

  it('treats the sun-driven `sky` kind as an active backdrop in walk mode', () => {
    // The procedural sky occupies the same `scene.background` slot, so the
    // surround dome hides for it too (SkyBackdrop owns the paint).
    expect(isPhotoBackdropActive('sky', 'firstPerson')).toBe(true)
    expect(isPhotoBackdropActive('sky', 'orbit')).toBe(false)
  })

  it('does NOT claim the background slot for `sky` when its painter is unavailable', () => {
    // WINDOW-SKY-DEFAULT. This predicate does double duty: it tells SceneBackdrop
    // to paint AND tells the surround dome to stand down. For `sky` with the
    // `proceduralSky` feature off, nothing paints — so claiming the slot left the
    // window a flat dead grey slab (measured at win-mainBedroom-N). Returning
    // false hands the view back to the always-on sun-driven dome.
    expect(isPhotoBackdropActive('sky', 'firstPerson', false, false)).toBe(false)
    expect(isPhotoBackdropActive('sky', 'firstPerson', false, true)).toBe(true)
  })

  it('leaves every OTHER kind unaffected by sky availability', () => {
    // The new argument must be scoped to `sky` alone — a static photo preset
    // paints from BACKDROP_PRESETS and never depends on the procedural feature.
    for (const kind of ['city', 'dusk', 'park', 'hills'] as const) {
      expect(isPhotoBackdropActive(kind, 'firstPerson', false, false)).toBe(true)
    }
    expect(isPhotoBackdropActive('custom', 'firstPerson', true, false)).toBe(true)
    expect(isPhotoBackdropActive('none', 'firstPerson', false, true)).toBe(false)
  })

  it('is inactive in orbit mode (surroundings not needed for the dollhouse)', () => {
    for (const kind of ['city', 'dusk', 'park', 'hills', 'sky', 'custom', 'none'] as const) {
      expect(isPhotoBackdropActive(kind, 'orbit', true)).toBe(false)
    }
  })

  it('is inactive for the `none` backdrop even in walk mode (plain sky)', () => {
    expect(isPhotoBackdropActive('none', 'firstPerson')).toBe(false)
  })

  it('activates `custom` only when an uploaded image is present', () => {
    expect(isPhotoBackdropActive('custom', 'firstPerson', false)).toBe(false)
    expect(isPhotoBackdropActive('custom', 'firstPerson', true)).toBe(true)
  })
})

describe('BACKDROPS picker options', () => {
  it('lists every photo preset plus sky + custom + none, and each photo preset id has a bake', () => {
    const ids = BACKDROPS.map((b) => b.id)
    expect(ids).toEqual(['city', 'dusk', 'park', 'hills', 'sky', 'custom', 'none'])
    for (const id of ids) {
      // `none`/`custom` have no procedural bake; `sky` is baked from the analytic
      // core (`bakeSkyEquirect`), not from BACKDROP_PRESETS.
      if (id === 'none' || id === 'custom' || id === 'sky') continue
      expect(BACKDROP_PRESETS[id as keyof typeof BACKDROP_PRESETS]).toBeDefined()
    }
  })
})

describe('backdrop flags tiering (both modes)', () => {
  it('backdrops + customBackdrop are prod-safe simple-tier, on in Simple AND Pro', () => {
    for (const mode of ['simple', 'pro'] as const) {
      const flags = resolveFlags(false, {}, false, mode)
      expect(flags.backdrops).toBe(true)
      expect(flags.customBackdrop).toBe(true)
    }
  })

  it('proceduralSky is SIMPLE-tier, so the default `sky` backdrop can actually paint', () => {
    // WINDOW-SKY-DEFAULT: `backdrop` defaults to `'sky'`, and a pro-tier flag is
    // forced off in Simple — the app default — so a pro tier here would make the
    // DEFAULT window view unreachable for the default user. Pinned in BOTH modes.
    for (const mode of ['simple', 'pro'] as const) {
      expect(resolveFlags(false, {}, false, mode).proceduralSky).toBe(true)
    }
  })

  it('the default backdrop is the sun-driven sky, and it is paintable in Simple', () => {
    // The pair is the actual invariant: either half alone is a regression. A
    // `'sky'` default with the feature off renders NOTHING; the feature on with a
    // `'city'` default leaves the time-invariant skyline as what users see.
    expect(UI_INITIAL.backdrop).toBe('sky')
    const flags = resolveFlags(false, {}, false, 'simple')
    expect(
      isPhotoBackdropActive(UI_INITIAL.backdrop, 'firstPerson', false, flags.proceduralSky),
    ).toBe(true)
  })
})

describe('backdropVisibleNow (GLASS-SKYCATCH-VEIL)', () => {
  // The window panes call this inside `useFrame`, so it must read the LIVE store
  // with no hooks. It is the switch that retires the emissive sky-catch once a
  // real view is painted behind the glass — see `glassSkyCatchIntensity`.
  it('follows the camera mode for the default `sky` backdrop', () => {
    const prev = useStore.getState().cameraMode
    useStore.setState({ backdrop: 'sky', cameraMode: 'orbit' })
    expect(backdropVisibleNow()).toBe(false)
    useStore.setState({ cameraMode: 'firstPerson' })
    expect(backdropVisibleNow()).toBe(true)
    useStore.setState({ cameraMode: prev })
  })

  it('is false for `none` in walk mode, so the plain dome keeps its stand-in', () => {
    // `none` paints nothing into the background slot — the DreiSky dome takes the
    // view back, and that dome is exactly the washed near-white case RZ2's
    // sky-catch was added for. Retiring it there would be a regression.
    const prev = useStore.getState()
    useStore.setState({ backdrop: 'none', cameraMode: 'firstPerson' })
    expect(backdropVisibleNow()).toBe(false)
    useStore.setState({ backdrop: prev.backdrop, cameraMode: prev.cameraMode })
  })

  it('needs an uploaded image before `custom` counts as painted', () => {
    const prev = useStore.getState()
    useStore.setState({ backdrop: 'custom', cameraMode: 'firstPerson', customBackdropUrl: null })
    expect(backdropVisibleNow()).toBe(false)
    useStore.setState({ customBackdropUrl: 'blob:x' })
    expect(backdropVisibleNow()).toBe(true)
    useStore.setState({
      backdrop: prev.backdrop,
      cameraMode: prev.cameraMode,
      customBackdropUrl: prev.customBackdropUrl,
    })
  })
})

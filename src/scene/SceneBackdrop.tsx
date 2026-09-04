import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  CanvasTexture,
  CubeTexture,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  Texture,
} from 'three'
import { isFeatureEnabled } from '../features/featureFlags'
import { useFeature } from '../features/useFeature'
import type { CameraMode } from '../state/slices/cameraSlice'
import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'
import { bakeBackdropEquirect, bakeSkyEquirect, type PhotoBackdropKind } from './backdropEquirect'
import { equirectToCubeFaces } from './equirectToCube'
import {
  daylightFromAltitude,
  lightingFromAltitude,
  skyFromAltitude,
} from './lighting/altitudeCurve'
import { bakeSkyFromKeys, preloadSkyKeys, skyKeysReady } from './lighting/skyKeyBake'
import { type SkyState, shouldRebuildSky } from './lighting/skyRebuild'
import { orientedSunDirection } from './lighting/sunPosition'
import { useSunPosition } from './lighting/useSunPosition'

export type { BackdropKind }

/** A selectable photo backdrop (label/sub for the picker UI). All backdrops are
 *  flat equirectangular views shown **in walk mode only** (seen through windows);
 *  `custom` is the user-uploaded photo (only offered once one is uploaded), `sky`
 *  is the sun-driven procedural sky (gated by `proceduralSky`), and `none` shows
 *  the plain DreiSky dome with no skyline. */
export const BACKDROPS: { id: BackdropKind; label: string; sub: string }[] = [
  { id: 'city', label: 'City', sub: 'Daytime HDB skyline' },
  { id: 'dusk', label: 'Dusk', sub: 'Evening city lights' },
  { id: 'park', label: 'Park', sub: 'Green tree-line' },
  { id: 'hills', label: 'Hills', sub: 'Distant green hills' },
  { id: 'sky', label: 'Sky', sub: 'Sun-driven procedural sky' },
  { id: 'custom', label: 'Your photo', sub: 'Uploaded panorama' },
  { id: 'none', label: 'None', sub: 'Plain sky, no view' },
]

/** Whether a backdrop is painted into `scene.background`: only in walk
 *  (first-person) mode, and only for a kind that has imagery — `none` is the
 *  plain dome, and `custom` needs an uploaded photo. Both the static photo
 *  presets and the `sky` procedural backdrop occupy the same background slot, so
 *  the surround dome hides whenever this is true. Pure / unit-testable.
 *
 *  `skyAvailable` is the load-bearing argument (WINDOW-SKY-DEFAULT). This
 *  predicate does double duty: it tells `SceneBackdrop` to paint, AND it tells
 *  `lighting/Sky.tsx` to STAND DOWN so its dome can't occlude the painted
 *  background. For `sky` those two only agree while something can actually paint
 *  it — `SkyBackdrop` mounts only when the `proceduralSky` feature is on. With
 *  the feature off, returning `true` claimed the background slot for a painter
 *  that never ran and simultaneously suppressed the dome, leaving the window a
 *  flat dead grey slab (measured at the `win-mainBedroom-N` pose). So `sky` is
 *  active only when it is available; otherwise the sun-driven surround dome —
 *  which is deliberately NOT flag-gated (SKY-ANALYTIC-ORBIT) — takes the view
 *  back. Default `true` keeps every existing caller's behaviour. */
export function isPhotoBackdropActive(
  kind: BackdropKind,
  cameraMode: CameraMode,
  hasCustomImage = false,
  skyAvailable = true,
): boolean {
  if (cameraMode !== 'firstPerson') return false
  if (kind === 'none') return false
  if (kind === 'custom') return hasCustomImage
  if (kind === 'sky') return skyAvailable
  return true
}

/**
 * Rehost an equirect texture's pixels as a `CubeTexture`. DEV measurement seam for `(r)`.
 *
 * Returns `null` rather than throwing if the source has no readable image -- a backdrop that fails
 * to convert must fall back to the shipped equirect path, not blank the sky.
 */
function asCube(tex: Texture): CubeTexture | null {
  const img = tex.image as (HTMLCanvasElement | HTMLImageElement) | undefined
  const w = (img as HTMLCanvasElement | undefined)?.width ?? 0
  const h = (img as HTMLCanvasElement | undefined)?.height ?? 0
  if (!img || w < 8 || h < 4) return null
  const read = document.createElement('canvas')
  read.width = w
  read.height = h
  const rctx = read.getContext('2d')
  if (!rctx) return null
  rctx.drawImage(img, 0, 0)
  // A cube face spans 90 degrees where the equirect spans 360, so `w / 4` is the matched
  // resolution: larger would invent detail, smaller would throw away what `(r)` is about.
  const size = Math.max(16, Math.min(1024, Math.round(w / 4)))
  const faces = equirectToCubeFaces(rctx.getImageData(0, 0, w, h), size)
  const canvases = faces.map((f) => {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const cctx = c.getContext('2d')
    if (cctx) {
      // `createImageData` + `set` rather than `new ImageData(data, w, h)`: the constructor's
      // overload rejects a plain `Uint8ClampedArray` under this TS lib, and going through the
      // context also guarantees the buffer matches the canvas it is written to.
      const id = cctx.createImageData(size, size)
      id.data.set(f.data)
      cctx.putImageData(id, 0, 0)
    }
    return c
  })
  const cube = new CubeTexture(canvases)
  cube.colorSpace = SRGBColorSpace
  cube.needsUpdate = true
  return cube
}

/**
 * Live read of `isPhotoBackdropActive` straight from the store + feature flags —
 * safe to call inside a `useFrame` loop (no hooks). Used by the window panes to
 * retire their emissive sky-catch when a real view is painted behind the glass
 * (GLASS-SKYCATCH-VEIL); see `glassSkyCatchIntensity`.
 */
export function backdropVisibleNow(): boolean {
  const s = useStore.getState()
  return isPhotoBackdropActive(
    s.backdrop,
    s.cameraMode,
    !!s.customBackdropUrl,
    isFeatureEnabled('proceduralSky'),
  )
}

/** Configure a texture as an LDR equirectangular `scene.background`. */
function asEquirect(tex: Texture): Texture {
  tex.mapping = EquirectangularReflectionMapping
  tex.colorSpace = SRGBColorSpace
  return tex
}

/**
 * Manages the static equirectangular photo backdrops + the user's uploaded photo.
 * The sun-driven `sky` kind is owned by `SkyBackdrop` (rebuilt as the sun moves),
 * so this baker skips it. Surroundings are only needed in **walk mode** (to look
 * out the windows); in orbit the dollhouse renders against the plain DreiSky dome.
 * Sets `scene.background` to the selected preset (baked once) or the uploaded
 * photo, and restores/clears + disposes on exit or change. Renders no geometry.
 */
export function SceneBackdrop() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const kind = useStore((s) => s.backdrop)
  const cameraMode = useStore((s) => s.cameraMode)
  const customUrl = useStore((s) => s.customBackdropUrl)
  const proceduralSky = useFeature('proceduralSky')
  // PHOTO-BACKDROP-HOUR: the static presets are authored at one time of day, which
  // measurably fights the interior's own grade (at 18:00 `city` renders COOLER
  // than the room in front of it). Re-bake them against the hour. Quantised to
  // 0.1 so scrubbing the time slider cannot re-bake the equirect every frame.
  const sunAlt = useSunPosition().altitude
  const daylight = Math.round(daylightFromAltitude(sunAlt) * 10) / 10
  // Warmth follows how LOW the sun is (0 above 30°, 1 on the horizon), NOT the
  // night ramp — which saturates at 1 for every altitude above 0° and so would
  // leave golden hour, the hour the defect was measured at, untouched.
  const altDeg = (sunAlt * 180) / Math.PI
  const lowSun = Math.round(Math.max(0, Math.min(1, 1 - altDeg / 30)) * 10) / 10
  // Quantised to half a degree AND memoised, so the tint is referentially stable
  // across frames — otherwise a fresh array every render re-bakes the equirect.
  const altQ = Math.round(altDeg * 2) / 2
  const tint = useMemo(() => lightingFromAltitude((altQ * Math.PI) / 180).sunColor, [altQ])
  // `sky` is owned by SkyBackdrop; when the flag is off it falls back to no
  // backdrop (the plain dome) rather than a static photo.
  const isSky = kind === 'sky'
  const active = isPhotoBackdropActive(kind, cameraMode, !!customUrl, proceduralSky) && !isSky

  useEffect(() => {
    if (!active) return
    const prev = scene.background
    let texture: Texture | null = null
    let cancelled = false

    const apply = (tex: Texture) => {
      if (cancelled) {
        tex.dispose()
        return
      }
      // `?bgCube=1` (DEV) hosts the SAME asset as a CUBE texture instead of an equirect.
      //
      // A measurement seam for item `(r)`, not a feature. `v0.31.5.263`/`.265` established that
      // three converts an equirect `scene.background` into a pre-filtered CubeUV/PMREM, so a crisp
      // 2048x1024 skyline arrives at the window as faint blobs -- and that the content survives to
      // the GPU intact, since rehosting the same canvas with `UVMapping` shows a legible city.
      // `UVMapping` is not shippable (no parallax, not projectively correct through a window); a
      // cube texture is the candidate that keeps `scene.background`'s structure. The premise --
      // that a cube background is NOT PMREM-converted the way an equirect is -- is a claim about
      // three's internals worth testing on the existing presets before re-authoring four of them.
      const wantCube =
        import.meta.env.DEV && new URLSearchParams(window.location.search).get('bgCube') === '1'
      const cube = wantCube ? asCube(tex) : null
      texture = cube ?? asEquirect(tex)
      scene.background = texture
      invalidate()
    }

    if (kind === 'custom' && customUrl) {
      // The uploaded photo loads asynchronously from its object URL.
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const tex = new Texture(img)
        tex.needsUpdate = true
        apply(tex)
      }
      img.src = customUrl
    } else if (kind !== 'custom' && kind !== 'none') {
      // `active` already excludes the `sky` kind (owned by SkyBackdrop), so the
      // remaining kinds are the static photo presets.
      apply(
        new CanvasTexture(
          bakeBackdropEquirect(kind as PhotoBackdropKind, { daylight, lowSun, tint }),
        ),
      )
    }

    return () => {
      cancelled = true
      if (texture && scene.background === texture) scene.background = prev ?? null
      texture?.dispose()
      invalidate()
    }
  }, [active, kind, customUrl, daylight, lowSun, tint, scene, invalidate])

  // The sun-driven sky mounts only when its feature is on AND the sky kind is
  // selected + active in walk mode.
  if (proceduralSky && isSky && isPhotoBackdropActive(kind, cameraMode, !!customUrl, true)) {
    return <SkyBackdrop />
  }
  return null
}

/** Debounce (ms) before a sun move triggers a re-bake — coalesces a slider drag
 *  or a burst of system ticks into one upload. */
const SKY_REBUILD_DEBOUNCE_MS = 120

/**
 * The sun-driven procedural sky backdrop (RD-412). Bakes an analytic Preetham sky
 * equirect into `scene.background` and re-bakes (debounced) whenever the sun
 * direction / turbidity / plan orientation crosses the `shouldRebuildSky`
 * threshold, disposing the previous texture each time. Walk-mode background only —
 * it deliberately does **not** touch `scene.environment` (the IBL is out of scope).
 */
function SkyBackdrop() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const sunPos = useSunPosition()
  const orientationDeg = useStore((s) => s.orientationDeg)

  const next: SkyState = {
    sunDir: orientedSunDirection(sunPos, orientationDeg),
    turbidity: skyFromAltitude(sunPos.altitude).turbidity,
    orientationDeg,
  }

  // Refs persist across renders: the last-baked params (rebuild predicate input),
  // the live texture (to dispose), and the saved prior background (to restore).
  const lastBaked = useRef<SkyState | null>(null)
  const textureRef = useRef<Texture | null>(null)
  const prevBgRef = useRef<Texture | null>(null)
  const savedPrev = useRef(false)

  // Kick the key-set fetch on mount (DEV seam only). `preloadSkyKeys` is idempotent and resolves
  // even on failure, so a missing asset degrades to the analytic sky instead of hanging.
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('skyKeys') === '1') {
      void preloadSkyKeys().then(() => invalidate())
    }
  }, [invalidate])

  // Mount/unmount: remember + restore the prior background, dispose on exit.
  useEffect(() => {
    if (!savedPrev.current) {
      prevBgRef.current = (scene.background as Texture) ?? null
      savedPrev.current = true
    }
    return () => {
      if (textureRef.current && scene.background === textureRef.current) {
        scene.background = prevBgRef.current ?? null
      }
      textureRef.current?.dispose()
      textureRef.current = null
      lastBaked.current = null
      savedPrev.current = false
      invalidate()
    }
  }, [scene, invalidate])

  // Re-bake (debounced) when the sun crosses the threshold. The effect closure
  // captures the current `next` snapshot; it re-runs whenever any sun / turbidity
  // / orientation field changes (object identity changes every render, so we list
  // the fields rather than `next` itself).
  const { turbidity, sunDir } = next
  useEffect(() => {
    const candidate: SkyState = { sunDir, turbidity, orientationDeg }
    if (!shouldRebuildSky(lastBaked.current, candidate)) return
    const handle = setTimeout(() => {
      // `?skyKeys=1` (DEV) swaps the analytic Preetham paint for the baked CYCLES key set.
      //
      // The runtime half of `(z)`4 / item `(l)`: the app's window reads as a panel rather than an
      // opening, and `v0.31.7.77` measured that the fix needs the PHYSICAL sky —
      // `backgroundIntensity ~= 4` alone raises a 4x-oversaturated gradient. `.148`–`.150` priced
      // the key set: 30° of altitude holds Cycles to <=1.4 % (<=0.67 % in the brightest decile),
      // the error is independent of resolution and sample count, and four keys are 500 kB.
      //
      // A DEV seam first, not a default, following `?bgCube=1` in `.132`: a new default sky is
      // user-visible at every hour of the day and wants frames at several of them before it ships.
      const keyed =
        import.meta.env.DEV &&
        new URLSearchParams(window.location.search).get('skyKeys') === '1' &&
        skyKeysReady()
          ? bakeSkyFromKeys(sunDir)
          : null
      const tex = asEquirect(new CanvasTexture(keyed ?? bakeSkyEquirect(sunDir, turbidity)))
      // `?bgIntensity=<n>` (DEV) — the OTHER half of `(l)`'s fix, and it is measured useless alone
      // in both directions: `v0.31.7.77` found the intensity without the physical sky raises a
      // 4x-oversaturated gradient, and `v0.31.7.152` found the physical sky without the intensity
      // moves the interior frame by ~1-2 counts. `scene.backgroundIntensity` scales what is SEEN,
      // not what LIGHTS (that is `environmentIntensity`), which is why `.77` could verify the
      // interior median unchanged at intensity 1, 4 and 12.
      if (import.meta.env.DEV) {
        const bg = Number(new URLSearchParams(window.location.search).get('bgIntensity'))
        if (Number.isFinite(bg) && bg > 0) scene.backgroundIntensity = bg
      }
      const old = textureRef.current
      textureRef.current = tex
      lastBaked.current = candidate
      scene.background = tex
      old?.dispose()
      invalidate()
    }, SKY_REBUILD_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [sunDir, turbidity, orientationDeg, scene, invalidate])

  return null
}

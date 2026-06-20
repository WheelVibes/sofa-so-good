import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace, Texture } from 'three'
import { useFeature } from '../features/useFeature'
import type { CameraMode } from '../state/slices/cameraSlice'
import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'
import { bakeBackdropEquirect, bakeSkyEquirect, type PhotoBackdropKind } from './backdropEquirect'
import { skyFromAltitude } from './lighting/altitudeCurve'
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
 *  the DreiSky dome hides whenever this is true. Pure / unit-testable. */
export function isPhotoBackdropActive(
  kind: BackdropKind,
  cameraMode: CameraMode,
  hasCustomImage = false,
): boolean {
  if (cameraMode !== 'firstPerson') return false
  if (kind === 'none') return false
  if (kind === 'custom') return hasCustomImage
  return true
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
  // `sky` is owned by SkyBackdrop; when the flag is off it falls back to no
  // backdrop (the plain dome) rather than a static photo.
  const isSky = kind === 'sky'
  const active = isPhotoBackdropActive(kind, cameraMode, !!customUrl) && !isSky

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
      texture = asEquirect(tex)
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
      apply(new CanvasTexture(bakeBackdropEquirect(kind as PhotoBackdropKind)))
    }

    return () => {
      cancelled = true
      if (texture && scene.background === texture) scene.background = prev ?? null
      texture?.dispose()
      invalidate()
    }
  }, [active, kind, customUrl, scene, invalidate])

  // The sun-driven sky mounts only when its feature is on AND the sky kind is
  // selected + active in walk mode.
  if (proceduralSky && isSky && isPhotoBackdropActive(kind, cameraMode, !!customUrl)) {
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
      const tex = asEquirect(new CanvasTexture(bakeSkyEquirect(sunDir, turbidity)))
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

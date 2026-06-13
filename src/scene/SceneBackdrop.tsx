import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace, Texture } from 'three'
import type { CameraMode } from '../state/slices/cameraSlice'
import type { BackdropKind } from '../state/slices/uiSlice'
import { useStore } from '../state/store'
import { bakeBackdropEquirect, type PhotoBackdropKind } from './backdropEquirect'

export type { BackdropKind }

/** A selectable photo backdrop (label/sub for the picker UI). All backdrops are
 *  flat equirectangular photos shown **in walk mode only** (seen through windows);
 *  `custom` is the user-uploaded photo (only offered once one is uploaded) and
 *  `none` shows the plain procedural sky with no skyline. */
export const BACKDROPS: { id: BackdropKind; label: string; sub: string }[] = [
  { id: 'city', label: 'City', sub: 'Daytime HDB skyline' },
  { id: 'dusk', label: 'Dusk', sub: 'Evening city lights' },
  { id: 'park', label: 'Park', sub: 'Green tree-line' },
  { id: 'hills', label: 'Hills', sub: 'Distant green hills' },
  { id: 'custom', label: 'Your photo', sub: 'Uploaded panorama' },
  { id: 'none', label: 'None', sub: 'Plain sky, no view' },
]

/** Whether the photo backdrop should be painted into `scene.background`: only in
 *  walk (first-person) mode, and only for a backdrop that has imagery — `none` is
 *  the plain sky, and `custom` needs an uploaded photo. Pure / unit-testable. */
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
 * Manages the equirectangular photo backdrop. Surroundings are only needed in
 * **walk mode** (to look out the windows); in orbit the dollhouse renders against
 * the plain procedural sky. When active, sets `scene.background` to the selected
 * preset (baked once) or the user's uploaded photo, and restores/clears + disposes
 * on exit or change. Renders no geometry — zero per-frame draw calls.
 */
export function SceneBackdrop() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const kind = useStore((s) => s.backdrop)
  const cameraMode = useStore((s) => s.cameraMode)
  const customUrl = useStore((s) => s.customBackdropUrl)
  const active = isPhotoBackdropActive(kind, cameraMode, !!customUrl)

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
      apply(new CanvasTexture(bakeBackdropEquirect(kind as PhotoBackdropKind)))
    }

    return () => {
      cancelled = true
      if (texture && scene.background === texture) scene.background = prev ?? null
      texture?.dispose()
      invalidate()
    }
  }, [active, kind, customUrl, scene, invalidate])

  return null
}

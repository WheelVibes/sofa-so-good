import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three'
import { bakeSkylineCanvas } from './skylineEquirect'

/**
 * The `skyline` backdrop (PHOTO-BACKDROP): a single baked equirectangular image
 * set as `scene.background`. Renders **no geometry** — zero per-frame draw calls
 * (vs the instanced City/Park/Hills estates), correct through every window, and
 * it never occludes the flat or blocks the sun. Restores the previous background
 * on unmount so switching backdrops leaves no residue, and disposes the texture.
 */
export function SkylineBackdrop() {
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)

  const texture = useMemo(() => {
    const tex = new CanvasTexture(bakeSkylineCanvas())
    tex.mapping = EquirectangularReflectionMapping
    tex.colorSpace = SRGBColorSpace
    return tex
  }, [])

  useEffect(() => {
    const prev = scene.background
    scene.background = texture
    invalidate()
    return () => {
      // Only restore if nothing else took over the slot in the meantime.
      if (scene.background === texture) scene.background = prev ?? null
      texture.dispose()
      invalidate()
    }
  }, [scene, invalidate, texture])

  return null
}

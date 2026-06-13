import { RoundedBox } from '@react-three/drei'
import { type ComponentProps, forwardRef } from 'react'
import type { Mesh } from 'three'
import { useDetail } from './useDetail'

/**
 * Safe chamfer radius for a box of the given dimensions: a target chamfer
 * clamped so it never reaches half the thinnest side (drei `RoundedBox`
 * degenerates — self-intersects — once the radius ≥ half the smallest
 * dimension). Pure + unit-tested.
 */
export function safeBevelRadius(w: number, h: number, d: number, target = 0.007): number {
  const minDim = Math.min(Math.abs(w), Math.abs(h), Math.abs(d))
  return Math.max(0, Math.min(target, minDim * 0.4))
}

export type BeveledBoxProps = Omit<ComponentProps<typeof RoundedBox>, 'radius' | 'args'> & {
  /** Box dimensions `[width, height, depth]` in metres. */
  args: [number, number, number]
  /** Target chamfer radius in metres (default 7 mm), auto-clamped to the box. */
  bevel?: number
}

/**
 * A drei `RoundedBox` with a furniture-appropriate **auto-clamped chamfer** and
 * detail-scaled smoothness — a drop-in for a sharp `<mesh><boxGeometry/></mesh>`
 * slab so hard furniture edges (tabletops, carcasses, legs) catch a highlight
 * instead of reading as flat cardboard. Pass `material=` / mesh props as usual.
 * The chamfer is tiny (≤7 mm) so footprints/joins are visually unchanged.
 */
export const BeveledBox = forwardRef<Mesh, BeveledBoxProps>(function BeveledBox(
  { args, bevel, smoothness, children, ...rest },
  ref,
) {
  const detail = useDetail()
  const radius = safeBevelRadius(args[0], args[1], args[2], bevel)
  // A couple of segments is plenty for a small chamfer; a touch more on High+.
  const sm = smoothness ?? (detail >= 1.5 ? 3 : 2)
  return (
    <RoundedBox ref={ref} args={args} radius={radius} smoothness={sm} {...rest}>
      {children}
    </RoundedBox>
  )
})

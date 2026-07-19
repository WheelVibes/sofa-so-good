import type { LayoutEntry } from './types'

/** Bath 1 — origin (1.45, 5.10), 2.40 × 1.60 m; Bath 2 — origin
 *  (3.95, 5.10), 2.05 × 1.60 m. WC against the south wall, basin against
 *  the east wall. All positions honour CLEARANCE.wallGap = 0.05 m from
 *  interior wall faces. */
export const bathrooms: LayoutEntry[] = [
  // Bath 1 — shower in the W corner, WC + basin along the E wall.
  // Shower: flush to west (x≈1.45+0.05+0.45=1.95) and north (z≈5.10+0.05+0.45=5.60) walls.
  { id: 'default-bath1-shower', defId: 'shower', position: [1.95, 5.6], rotation: 0, props: {} },
  {
    id: 'default-bath1-wc',
    defId: 'toilet',
    // Flush to east wall (inner x≈3.85; center x=3.85−0.05−0.20=3.60) and south wall
    // (inner z≈6.70; center z=6.70−0.05−0.28=6.37, rotation=π → tank at south).
    position: [3.6, 6.37],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-bath1-basin',
    defId: 'bathroom-sink',
    // Against east wall (rotation=-π/2 → w=0.62 runs along Z, d=0.5 along X;
    // center x = 3.85−0.05−0.25=3.55; center z = 5.10+0.05+0.31=5.46).
    position: [3.55, 5.46],
    rotation: -Math.PI / 2,
    props: {},
  },
  {
    id: 'default-bath1-mirror',
    defId: 'bathroom-mirror',
    // Mounted on east wall face; x is at the wall face (3.85) minus tiny offset.
    position: [3.8, 5.46],
    rotation: -Math.PI / 2,
    props: { width: 0.5, height: 0.7, mountHeight: 1.5 },
  },
  {
    id: 'default-bath1-light',
    defId: 'ceiling-light',
    position: [2.65, 6.0],
    rotation: 0,
    props: { style: 'flush', mountHeight: 2.4 },
  },
  // Bath 2 — WC + basin against east wall (x≈6.00−0.05=5.95).
  {
    id: 'default-bath2-wc',
    defId: 'toilet',
    // East wall inner face x≈6.00−0.05=5.95; center x=5.95−0.20=5.75.
    // South wall inner face z≈6.70; center z=6.70−0.05−0.28=6.37.
    position: [5.75, 6.37],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-bath2-basin',
    defId: 'bathroom-sink',
    // Against the WEST wall (the bath1/bath2 partition, inner face x≈3.95),
    // NOT the east wall — bath2's door sits on the north wall right at the
    // east corner (offset 4.95, spans x≈5.05–5.85), so an east-wall basin
    // parked in the NE corner blocked the door swing (UXW-P2-3). The west
    // wall backs onto bath1's own wet wall, so basin plumbing stays shared.
    // rotation=+π/2 → w=0.62 along Z, d=0.5 along X; center x=3.95+0.25=4.20;
    // center z=5.10+0.05+0.31=5.46 (near north wall).
    position: [4.2, 5.46],
    rotation: Math.PI / 2,
    props: {},
  },
  {
    id: 'default-bath2-mirror',
    defId: 'bathroom-mirror',
    // Mounted on the west wall face above the relocated basin.
    position: [3.97, 5.46],
    rotation: Math.PI / 2,
    props: { width: 0.5, height: 0.7, mountHeight: 1.5 },
  },
  {
    id: 'default-bath2-light',
    defId: 'ceiling-light',
    position: [4.95, 5.9],
    rotation: 0,
    props: { style: 'flush', mountHeight: 2.4 },
  },
]

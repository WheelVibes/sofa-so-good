import type { LayoutEntry } from './types'

/** Bath 1 — interior [1.615,4.925]→[3.765,6.775] (2.15 × 1.85 m), ceiling
 *  2.4 m. West wall (wall-ext-bath1-W) is 300 mm RC (solid-black on the
 *  plan), moving the interior face 1.565 → 1.615 — east wall unaffected.
 *  Door on the north wall x=[2.59,3.39] (0.8 m swing zone into the room,
 *  z=[4.925,5.725]). Bath 2 — interior [3.865,4.925]→[5.615,6.775]
 *  (1.75 × 1.85 m), ceiling 2.4 m. East wall (wall-int-bath2-hs, the
 *  household-shelter RC ring) is 300 mm, moving its west face 3.865+1.85=
 *  5.715 → 3.865+1.75=5.615 — west wall unaffected. Door on the north wall
 *  x=[4.815,5.615] (swing zone z=[4.925,5.725], right against the east
 *  wall; offset nudged 3.4→3.35 from the old x=[4.865,5.665] so its edge
 *  clears the thickened HS wall body, which now reaches to x=5.615).
 *
 *  Bath 1: shower in the NW corner (west of the door, clear of its swing);
 *  WC + basin along the east wall, both kept south of the door's swing zone
 *  (the room is too narrow to stack both fixtures south of the door AND on
 *  the east wall otherwise). Bath 2: WC + basin on the WEST wall (the
 *  bath1/bath2 partition) — its door sits hard against the east wall, so an
 *  east-wall basin would sit inside the swing zone (UXW-P2-3); the west wall
 *  is clear of it entirely. All positions honour CLEARANCE.wallGap = 0.05 m
 *  from interior wall faces. */
export const bathrooms: LayoutEntry[] = [
  // Bath 1 — shower flush to west + north walls (west of the door, clear of
  // its x-range [2.59,3.39]). West wall face moved +0.05 east (1.565→1.615,
  // wall-ext-bath1-W thickened to 300 mm) — flush position shifts the same
  // +0.05: x 2.065 → 2.115.
  { id: 'default-bath1-shower', defId: 'shower', position: [2.115, 5.425], rotation: 0, props: {} },
  {
    id: 'default-bath1-wc',
    defId: 'toilet',
    // Flush to east wall (x=3.765−0.05−0.20=3.515) and south wall
    // (z=6.775−0.05−0.33=6.395, rotation=π → tank at south). South of the
    // door's swing zone (z ends at 5.725).
    position: [3.515, 6.395],
    rotation: Math.PI,
    props: {},
  },
  {
    id: 'default-bath1-basin',
    defId: 'bathroom-sink',
    // Flush to south wall (rotation=π → w=0.62 along X, d=0.5 along Z;
    // center z=6.775−0.05−0.25=6.475), west of the toilet. South of the
    // door's swing zone and clear of the shower.
    position: [2.955, 6.475],
    rotation: Math.PI,
    props: { style: 'wall-hung' },
  },
  {
    id: 'default-bath1-mirror',
    defId: 'bathroom-mirror',
    // Mounted on the south wall face above the basin.
    position: [2.955, 6.755],
    rotation: Math.PI,
    props: { width: 0.5, height: 0.7, mountHeight: 1.5 },
  },
  {
    id: 'default-bath1-light',
    defId: 'ceiling-light',
    // Room-centred; west face moved +0.05 (1.565→1.615), east face
    // unchanged (3.765) → new center x = (1.615+3.765)/2 = 2.69.
    position: [2.69, 5.85],
    rotation: 0,
    props: { style: 'flush', mountHeight: 2.4 },
  },
  // Bath 2 — WC + basin against the WEST wall (the bath1/bath2 partition),
  // clear of the door on the north wall (hard against the east wall).
  {
    id: 'default-bath2-wc',
    defId: 'toilet',
    // Flush to west wall (rotation=π/2 → w=0.4 along Z, d=0.66 along X;
    // center x=3.865+0.05+0.33=4.245) and south wall
    // (center z=6.775−0.05−0.20=6.525).
    position: [4.245, 6.525],
    rotation: Math.PI / 2,
    props: {},
  },
  {
    id: 'default-bath2-basin',
    defId: 'bathroom-sink',
    // Flush to west wall (rotation=π/2 → w=0.62 along Z, d=0.5 along X;
    // center x=3.865+0.05+0.25=4.165), near the north wall — well clear of
    // the door (its x-range starts at 4.865, far east of this basin).
    position: [4.165, 5.285],
    rotation: Math.PI / 2,
    props: { style: 'wall-hung' },
  },
  {
    id: 'default-bath2-mirror',
    defId: 'bathroom-mirror',
    // Mounted on the west wall face above the basin.
    position: [3.885, 5.285],
    rotation: Math.PI / 2,
    props: { width: 0.5, height: 0.7, mountHeight: 1.5 },
  },
  {
    id: 'default-bath2-light',
    defId: 'ceiling-light',
    // Room-centred; west face unchanged (3.865), east face moved −0.1
    // (5.715→5.615, wall-int-bath2-hs thickened) → new center x =
    // (3.865+5.615)/2 = 4.74.
    position: [4.74, 5.85],
    rotation: 0,
    props: { style: 'flush', mountHeight: 2.4 },
  },
]

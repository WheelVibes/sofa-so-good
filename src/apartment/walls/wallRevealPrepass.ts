/**
 * WALL-REVEAL-DEPTH-PREPASS — a per-PIXEL depth pre-pass so faded (wall-reveal) walls
 * composite as exactly ONE translucent layer, whatever the draw order.
 *
 * WALL-REVEAL-SINGLE-LAYER ordered faded walls front-to-back by a PER-WALL `renderOrder`
 * derived from the wall MIDPOINT's view-space depth. That is right for two parallel walls
 * stacked in depth and wrong at a CORNER where walls of different thickness meet: the thin
 * internal wall's mitred/buried end sits INSIDE the thick external wall's body, so over the
 * overlap the thick wall's front SURFACE is the nearer one even though its midpoint is
 * farther. It therefore draws second, its alpha accumulates over the thin wall's, and the
 * overlap reads as a darker vertical band exactly the width of the buried end. No per-OBJECT
 * ordering can fix that — the nearest surface changes per pixel.
 *
 * So the fade loops run a real depth pre-pass:
 *  1. every mesh that is still VISIBLE while its wall fades gets a depth-only TWIN
 *    (`syncRevealPrepass`) — same `BufferGeometry`, same transform, same `polygonOffset`,
 *    `colorWrite: false` + `depthWrite: true`. All twins sort at {@link REVEAL_PREPASS_ORDER},
 *    strictly below every faded colour draw, so the depth buffer holds the depth of the
 *    NEAREST faded surface at each pixel before any faded colour is blended.
 *  2. the colour draw of the same mesh runs with `depthWrite: false` and
 *    `depthFunc = EqualDepth` (`applyRevealColourDepth`), so colour lands only on that nearest
 *    faded fragment. One layer per pixel, order-independent.
 *
 * **Why the twins are `transparent: true` and not opaque.** Three draws the whole opaque list
 * before the whole transparent list, so an opaque twin would pre-empt no renderOrder juggling —
 * but it would also write depth BEFORE the room's own opaque furniture and floors, and every
 * interior object behind a faded wall would then depth-fail and vanish. Transparent twins run
 * after all opaque geometry (which has already drawn and is untouched) and before every faded
 * colour draw, which is exactly the window the pre-pass needs.
 *
 * The reveal is a UI device for looking into the dollhouse, not a physical surface, so there is
 * nothing here to reference-render in Cycles.
 */

import {
  EqualDepth,
  LessEqualDepth,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three'
import { REVEAL_ORDER_BASE } from './wallRevealMath'

/**
 * `renderOrder` every depth-only twin carries: one below {@link REVEAL_ORDER_BASE}, which is
 * itself the floor of `revealRenderOrder`. So the pre-pass is strictly ahead of every faded
 * colour draw, which in turn sit ahead of every ordinary transparent object (`renderOrder` 0).
 */
export const REVEAL_PREPASS_ORDER = REVEAL_ORDER_BASE - 1

/**
 * `depthFunc` a faded colour draw uses while the pre-pass is providing its depth.
 *
 * `EqualDepth` is exact — only the fragment whose depth the pre-pass wrote survives — and it is
 * safe here because both passes rasterise the SAME geometry through the same transform with the
 * same `polygonOffset`, and three's `project_vertex` chunk computes `gl_Position` identically for
 * `MeshBasicMaterial` and `MeshStandardMaterial`. If a future material path ever breaks that and
 * the faded wall goes salt-and-pepper (a depth mismatch drops scattered fragments),
 * `LessEqualDepth` is the fallback: the pre-pass has already taken the MINIMUM depth over all
 * faded surfaces, so nothing can pass in front of it and `LessEqual` keeps the same single layer
 * while tolerating a sub-ULP disagreement in one direction. No speckle was measured, so the exact
 * test ships.
 */
const REVEAL_COLOUR_DEPTH_FUNC = EqualDepth

/** True for a mesh created by {@link syncRevealPrepass} — every fade traverse must skip these
 *  (they carry no `emissive`, must keep their own `renderOrder`, and must not be re-twinned). */
export function isRevealPrepass(o: Object3D | null | undefined): boolean {
  return !!o && (o.userData as { wallRevealPrepass?: unknown }).wallRevealPrepass === true
}

/**
 * Attach / update / hide the depth-only twin of one faded wall mesh.
 *
 * The twin is a CHILD of `mesh` with an identity local transform, so its `matrixWorld` is a
 * bit-exact copy of the mesh's and the two rasterise identical depth — which is what
 * `EqualDepth` needs. It shares the mesh's geometry (never disposes it) and copies the drawn
 * material's `side` + `polygonOffset` (the per-wall `bodyBias`/`bias` depth nudge) for the same
 * reason. `faded === false` simply hides it; no twin is ever created for a wall that is not
 * fading, so the flag-off arm allocates nothing.
 */
export function syncRevealPrepass(mesh: Mesh, faded: boolean): void {
  let twin = mesh.children.find(isRevealPrepass) as Mesh | undefined
  if (!twin) {
    if (!faded) return
    twin = new Mesh(
      mesh.geometry,
      new MeshBasicMaterial({
        // Depth only: no colour, no blend contribution, but a full depth write/test.
        colorWrite: false,
        depthWrite: true,
        depthTest: true,
        // Transparent so it lands in the transparent pass, AFTER all opaque geometry — see
        // the module note. `renderOrder` then puts it before every faded colour draw.
        transparent: true,
      }),
    )
    twin.name = 'wall-reveal-depth-prepass'
    twin.userData = { wallRevealPrepass: true }
    twin.castShadow = false
    twin.receiveShadow = false
    // Never a pick target: the wall's own mesh already is one.
    twin.raycast = () => {}
    mesh.add(twin)
  }
  twin.visible = faded
  if (!faded) return
  if (twin.geometry !== mesh.geometry) twin.geometry = mesh.geometry
  twin.renderOrder = REVEAL_PREPASS_ORDER
  const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
    | Material
    | undefined
  const tm = twin.material as MeshBasicMaterial
  if (src) {
    tm.side = src.side
    tm.polygonOffset = src.polygonOffset
    tm.polygonOffsetFactor = src.polygonOffsetFactor
    tm.polygonOffsetUnits = src.polygonOffsetUnits
  }
}

/**
 * Depth state for the COLOUR draw of a faded wall surface.
 *
 * `prepass` true (the wall is fading and the flag is on): the twin owns the depth buffer, so
 * the colour draw stops writing depth and tests for EQUAL depth — it can only land on the
 * nearest faded fragment. `prepass` false: back to WALL-FADE-DEPTHWRITE's plain
 * `depthWrite: true` / `LessEqualDepth`, i.e. the pre-fix state, which is also what an opaque
 * wall must be restored to.
 */
export function applyRevealColourDepth(material: Material, prepass: boolean): void {
  material.depthWrite = !prepass
  material.depthFunc = prepass ? REVEAL_COLOUR_DEPTH_FUNC : LessEqualDepth
}

/** Detach + dispose every depth twin under `root` (unmount). The shared geometry is the wall's
 *  own and is deliberately left alone. */
export function disposeRevealPrepass(root: Object3D | null | undefined): void {
  if (!root) return
  const twins: Object3D[] = []
  root.traverse((o) => {
    if (isRevealPrepass(o)) twins.push(o)
  })
  for (const t of twins) {
    const m = (t as Mesh).material
    for (const mm of Array.isArray(m) ? m : [m]) mm?.dispose()
    t.removeFromParent()
  }
}

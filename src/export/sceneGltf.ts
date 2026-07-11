/**
 * Whole-scene 3D export: prepare the live three.js scene graph for a glTF/GLB
 * (or OBJ) export (Q-3DEXPORT — SweetHome3DJS ObjWriter/glTF parity).
 *
 * The app's 3D scene contains real home geometry (floor, walls, ceiling, doors,
 * windows, furniture, lights) **mixed with** editor-only helpers (selection
 * outline, rotate gizmo, hover highlight, grid, alignment guides, clearance/lux
 * overlays, measurement/annotation overlays, comment pins, sky, backdrop,
 * placement ghost). An export must keep the former and drop the latter.
 *
 * Helpers opt out of the export by tagging their root with `userData.noExport`
 * (see `noExportUserData` / `markNoExport`) — the preferred, drift-proof
 * convention (modelled on `finishDropTarget.ts`'s typed taggers). A structural
 * fallback also drops known three helper types + cameras so a future overlay
 * added without the tag can't leak into exports.
 *
 * The exclusion predicate is pure (plain `userData`/`type`/`parent` walks, no
 * three imports at runtime) so it unit-tests with faked Object3D hierarchies,
 * exactly like `finishDropTarget.ts`. `buildExportRoot` does the actual clone +
 * prune against a live `Object3D`.
 */

import type { Object3D } from 'three'

/** `userData` key set on any object (and its subtree) that must NOT be exported. */
const NO_EXPORT_KEY = 'noExport' as const

/** `userData` payload that excludes an object (+ its subtree) from 3D export.
 *  Spread onto an R3F object's `userData` prop: `userData={noExportUserData()}`.
 *  A fresh object per call so React never shares a mutable reference. */
export function noExportUserData(): { noExport: true } {
  return { noExport: true }
}

/** Imperatively tag an existing object so it (and its subtree) is skipped on
 *  export. For refs / non-JSX call sites; JSX should prefer `noExportUserData`. */
export function markNoExport(obj: Object3D): void {
  obj.userData[NO_EXPORT_KEY] = true
}

/** Minimal shape the exclusion walk needs — lets the predicate stay pure and
 *  unit-test against faked hierarchies without constructing real three objects. */
interface ExportNode {
  type?: string
  userData?: Record<string, unknown>
  parent?: ExportNode | null
}

function hasNoExportTag(obj: ExportNode): boolean {
  return obj.userData?.[NO_EXPORT_KEY] === true
}

/** Known three helper / non-geometry types that should never reach an export
 *  even when untagged (belt-and-suspenders behind the `noExport` tag). Cameras
 *  are matched by suffix so any *Camera type is dropped. */
const HELPER_TYPES = new Set([
  'GridHelper',
  'AxesHelper',
  'BoxHelper',
  'Box3Helper',
  'PlaneHelper',
  'PolarGridHelper',
  'ArrowHelper',
  'Sprite',
])

function isHelperType(type: string | undefined): boolean {
  if (!type) return false
  if (HELPER_TYPES.has(type)) return true
  // Cameras (PerspectiveCamera / OrthographicCamera / …) carry no exportable
  // geometry and confuse importers — drop them all.
  return type.endsWith('Camera')
}

/** True if this object *itself* is a helper to drop (own tag or helper type),
 *  without consulting ancestors. Used while pruning a cloned tree. */
function isExcludedSelf(obj: ExportNode): boolean {
  return hasNoExportTag(obj) || isHelperType(obj.type)
}

/**
 * True when the object — or any of its ancestors — is excluded from export.
 * The ancestor walk mirrors `classifyFinishDropObject`: a `noExport` tag on a
 * parent group hides the whole subtree. Pure; the public predicate used by
 * tests and any caller that wants to test a single object in place.
 */
export function shouldExcludeFromExport(obj: ExportNode | null | undefined): boolean {
  for (let cur: ExportNode | null | undefined = obj; cur; cur = cur.parent) {
    if (isExcludedSelf(cur)) return true
  }
  return false
}

/**
 * Deep-clone the scene root and strip every editor-only helper, returning a new
 * detached root suitable for GLTFExporter / OBJExporter. Home geometry (floor,
 * walls, ceiling, doors, windows, furniture) and lights are kept; helpers and
 * cameras are removed.
 *
 * Pruning checks only each node's *own* tag/type (`isExcludedSelf`): removing
 * the topmost tagged ancestor takes its subtree with it, so an ancestor walk is
 * unnecessary here and removing an already-orphaned node is a harmless no-op.
 */
export function buildExportRoot(sceneRoot: Object3D): Object3D {
  const clone = sceneRoot.clone(true)
  const toRemove: Object3D[] = []
  clone.traverse((o) => {
    if (isExcludedSelf(o as unknown as ExportNode)) toRemove.push(o)
  })
  for (const o of toRemove) o.removeFromParent()
  clone.name = clone.name || 'SofaSoGoodHome'
  return clone
}

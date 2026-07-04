import { obbCorners } from '../../../../collision/obb'
import { itemFootprint } from '../../../../collision/placement'
import type { FurnitureDef, FurnitureItem } from '../../../../furniture/types'

interface PlacementGhostLayerProps {
  /** The synthetic preview item (see `editor/planFurnishPlacement.ts`), or
   *  null while no catalog def is armed. */
  ghostItem: FurnitureItem | null
  def: FurnitureDef | null
  /** `canPlace` validity at the ghost's current world point — drives the
   *  green/red tint. */
  valid: boolean
  toPx: (m: number) => number
}

/**
 * PLAN-FURNISH Phase 1 — the SVG placement-ghost preview: a footprint polygon
 * that follows the cursor while a catalog def is armed (`activeDefId`),
 * tinted green/red by `canPlace` validity. The 2D analog of the 3D `scene/
 * PlacementGhost.tsx`, but SVG and driven by the editor's own pointer-move
 * dispatch (`onMove` → `setGhostWorld`) instead of a per-frame raycast — no
 * reactivation of the canvas-bound 3D ghost/controller. `pointer-events: none`
 * throughout so the preview never steals the click that commits it (the plan
 * `<svg>`'s own `onPointerDown`/`onPointerMove` own that). Renders nothing
 * while unarmed. A sibling of the other `editor/layers/*` SVG layers, mounted
 * last (topmost) in `FloorPlanEditor` so it's never obscured.
 */
export function PlacementGhostLayer({ ghostItem, def, valid, toPx }: PlacementGhostLayerProps) {
  if (!ghostItem || !def) return null
  const obb = itemFootprint(ghostItem, def)
  const pts = obbCorners(obb)
    .map(([x, z]) => `${toPx(x)},${toPx(z)}`)
    .join(' ')
  const tone = valid ? 'var(--ok)' : 'var(--danger)'
  return (
    <g style={{ pointerEvents: 'none' }} data-plan-ghost={def.id} data-plan-ghost-valid={valid}>
      <polygon
        points={pts}
        fill={tone}
        fillOpacity={0.35}
        stroke={tone}
        strokeWidth={2}
        strokeDasharray="6 4"
        strokeLinejoin="round"
      />
    </g>
  )
}

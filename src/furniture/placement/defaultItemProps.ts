/**
 * Default props for a freshly-armed placement — parametric defs seed their
 * full param-schema defaults; any other kind (GLB builtin/upload/remote/IKEA)
 * carries only its def-level `scale` (if any). Shared by every placement
 * surface — the 3D `scene/PlacementGhost.tsx` + `ui/catalog/
 * usePlacementController.ts`, and the 2D plan editor's `planFurnishPlacement`
 * (PLAN-FURNISH) — so a new item always starts from one single source of
 * defaults instead of three copies drifting apart.
 */
import { defaultParamProps, type FurnitureDef, type ParamProps } from '../types'

export function defaultItemProps(def: FurnitureDef): ParamProps {
  if (def.kind === 'parametric') return defaultParamProps(def)
  return def.scale != null ? { scale: def.scale } : {}
}

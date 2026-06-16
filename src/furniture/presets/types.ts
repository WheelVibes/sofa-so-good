import type { RoomId } from '../../apartment/types'
import type { MaterialId } from '../../materials/types'
import type { LayoutEntry } from '../defaults/types'
import type { ParamProps } from '../types'

/**
 * Full-flat layout presets. Rather than re-author every placement, a preset
 * reuses the curated default positions and restyles them: it overrides the
 * cosmetic props (colour / material / finish / weave / shape) per item type
 * and sets a coordinated floor + wall palette across the living spaces. This
 * keeps every preset collision-valid (identical positions to the move-in
 * default) while producing a distinct, cohesive interior-design look.
 */
export interface LayoutPreset {
  id: string
  name: string
  description: string
  /** Floor finish for the dry living spaces. */
  dryFloor: MaterialId
  /** Wall paint for the dry living spaces. */
  wall: MaterialId
  /** Per-defId cosmetic prop overrides merged onto the default items. */
  style: Record<string, ParamProps>
  /** Optional re-modelled living/dining arrangement (a researched real-world
   *  layout). When present these REPLACE the default `default-ld-*` items;
   *  other rooms keep their default placements (restyled by `style`).
   *  Sugar for `rooms.livingDining`. */
  livingDining?: LayoutEntry[]
  /** Optional re-modelled per-room arrangements. For each room id present, the
   *  authored entries REPLACE that room's default items (matched by id prefix);
   *  rooms not listed keep their default placements (restyled by `style`). */
  rooms?: Partial<Record<RoomId, LayoutEntry[]>>
  /** Extra items ADDED on top of the layout (e.g. feature walls). Taken as
   *  authored — typically noClip wall treatments so they always place. */
  extraItems?: LayoutEntry[]
}

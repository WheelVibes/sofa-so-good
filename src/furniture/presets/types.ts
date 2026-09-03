import type { RoomId } from '../../apartment/types'
import type { RoomCategory } from '../../floorplan/types'
import type { MaterialId } from '../../materials/types'
import type { LayoutEntry } from '../defaults/types'
import type { KitPiece } from '../furnishPlan'
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
  /**
   * Optional per-room-CATEGORY floor override, applied over `dryFloor`
   * (v0.31.8.17). A category absent here keeps `dryFloor`.
   *
   * Added for Peranakan Accent, where a single whole-home floor cannot express
   * the researched treatment: encaustic tiles "line the five-foot ways and
   * prestigious interior spaces" of a Peranakan shophouse, in a plan that
   * "transitions from public to private" — the front hall and courtyard, not the
   * bedrooms. Putting the tile on every dry floor would be the same error as
   * Coastal painting every wall its accent colour (fixed in v0.31.8.2): taking
   * an element the sources treat as belonging to one zone and making it the
   * whole home.
   *
   * Deliberately keyed on `RoomCategory` rather than `RoomId`, so it works on a
   * custom plan and a template as well as the fixed default flat — the same
   * reasoning as `categoryStyle`.
   */
  dryFloorByCategory?: Partial<Record<RoomCategory, MaterialId>>
  /** Wall paint for the dry living spaces. */
  wall: MaterialId
  /** Per-defId cosmetic prop overrides merged onto the default items. */
  style: Record<string, ParamProps>
  /** Optional per-room-CATEGORY cosmetic overrides (RM2), applied AFTER `style`
   *  so a bedroom can read calmer than the living room under the same theme —
   *  merge order is schema defaults < kit-fixed props < `style[defId]` <
   *  `categoryStyle[category][defId]`. Resolved via `roomCategory(room)` for a
   *  custom plan/template (`furnishPlanItems`) or the fixed default flat's
   *  per-room-id category mapping (`buildPresetItems`). */
  categoryStyle?: Partial<Record<RoomCategory, Record<string, ParamProps>>>
  /** Optional extra furniture kit pieces ADDED (appended) to the room-category
   *  kit a custom plan/template room would otherwise get (RM2) — lets a theme
   *  furnish rooms the base kit vocabulary doesn't cover well (e.g. a themed
   *  foyer bench) without redefining the whole kit. Keyed by `RoomCategory`. */
  kits?: Partial<Record<RoomCategory, KitPiece[]>>
  /** Optional linked palette preset id (`ui/color/palettePresets.ts`) applied
   *  to the apartment master palette alongside the preset (RM2). */
  paletteId?: string
  /** Gallery grouping (RM2): `'theme'` = the curated 2025-26 SG style gallery
   *  (SmartStart's primary grid); `'layout'` = a re-modelled-arrangement
   *  variant demoted to a secondary "Layouts" section. Omitted = hidden from
   *  both gallery sections (still resolvable by id for old saved designs). */
  group?: 'theme' | 'layout'
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

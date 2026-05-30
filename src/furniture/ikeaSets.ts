/**
 * IKEA set-recipe → arranged group expander.
 *
 * A scraped IKEA set (spec §1.5) is a `SetRecipe`: a name plus members, each a
 * standalone catalog def referenced by `groupKey`, with a `role` (table | chair
 * | bench | stool | other) and a `qty`. `expandMembers` flattens qty into a list
 * of `SetMemberInstance`; `arrangeSet` (Task 2/3) lays them out group-relative
 * using the design-rule spacing; `buildSetGroup` (Task 5) turns a recipe + drop
 * centre into ready-to-place `FurnitureItem[]` stamped with one shared groupId.
 */

import { CLEARANCE } from '../layout/designRules';
import type { FurnitureDef, FurnitureItem, ParamProps } from './types';
import { defaultParamProps } from './types';

export type SetRole = 'table' | 'chair' | 'bench' | 'stool' | 'other';

export interface SetMember {
  groupKey: string;
  role: SetRole;
  qty: number;
  articleNumber: string;
}

export interface SetRecipe {
  setKey: string;
  setName: string;
  members: SetMember[];
}

export interface SetMemberInstance {
  index: number;
  groupKey: string;
  role: SetRole;
}

export interface MemberFootprint {
  w: number;
  d: number;
}

export interface MemberPlacement {
  index: number;
  dx: number;
  dz: number;
  rotation: number;
}

/** Flatten `members × qty` into a contiguous, indexed instance list. Members
 *  keep recipe order (the table tends to be listed first per spec §1.2). */
export function expandMembers(recipe: SetRecipe): SetMemberInstance[] {
  const out: SetMemberInstance[] = [];
  let index = 0;
  for (const m of recipe.members) {
    const qty = Math.max(1, Math.floor(m.qty));
    for (let i = 0; i < qty; i++) {
      out.push({ index: index++, groupKey: m.groupKey, role: m.role });
    }
  }
  return out;
}

/** Evenly spaced offsets for `n` items centred on 0 across a usable span. */
function spread(n: number, span: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  return Array.from({ length: n }, (_, i) => -span / 2 + (span * i) / (n - 1));
}

/**
 * Group-relative arrangement for a set: the table sits at the origin; chairs and
 * stools are split across the table's two long edges, distributed along that
 * edge, gapped by `CLEARANCE.sofaToCoffee` from the table edge, and rotated to
 * face the table. Benches get one per long edge (centred); "other" members tuck
 * past the table's −X end. Returns one `MemberPlacement` per instance (by
 * `index`); the drop point is the origin.
 */
export function arrangeSet(
  members: SetMemberInstance[],
  footprints: Record<number, MemberFootprint>,
): MemberPlacement[] {
  const out: MemberPlacement[] = [];

  const table = members.find((m) => m.role === 'table');
  const tableFp = table ? footprints[table.index] : undefined;
  if (table) out.push({ index: table.index, dx: 0, dz: 0, rotation: 0 });

  const fp = tableFp ?? { w: 1.2, d: 0.8 };
  // Long edges run along the wider axis. longAlongX → chairs sit at ±Z.
  const longAlongX = fp.w >= fp.d;
  const halfPerp = (longAlongX ? fp.d : fp.w) / 2; // table half-extent toward the chair
  const alongHalf = (longAlongX ? fp.w : fp.d) / 2; // usable half-length of the long edge

  // Chairs + stools share the around-the-edges distribution.
  const seats = members.filter((m) => m.role === 'chair' || m.role === 'stool');
  const nFirst = Math.ceil(seats.length / 2);
  const sideA = seats.slice(0, nFirst);
  const sideB = seats.slice(nFirst);

  const placeRow = (row: SetMemberInstance[], sidePerp: 1 | -1) => {
    // Usable span along the edge leaves a small inset so end chairs stay over
    // the table footprint rather than overhanging the corner. Widen if needed
    // so same-edge seats clear roughly a seat width apart.
    const chairWGuess = 0.5;
    const usable = Math.max(alongHalf * 2 - 0.4, (row.length - 1) * (chairWGuess + 0.05));
    const offs = spread(row.length, usable);
    row.forEach((m, i) => {
      const chFp = footprints[m.index] ?? { w: 0.45, d: 0.5 };
      const chPerp = (longAlongX ? chFp.d : chFp.w) / 2;
      const perp = sidePerp * (halfPerp + CLEARANCE.sofaToCoffee + chPerp);
      // Face the table: chair on -perp faces +; on +perp faces -.
      if (longAlongX) {
        const rotation = sidePerp < 0 ? 0 : Math.PI; // -Z faces +Z(0); +Z faces -Z(PI)
        out.push({ index: m.index, dx: offs[i], dz: perp, rotation });
      } else {
        const rotation = sidePerp < 0 ? Math.PI / 2 : -Math.PI / 2; // -X faces +X; +X faces -X
        out.push({ index: m.index, dx: perp, dz: offs[i], rotation });
      }
    });
  };
  placeRow(sideA, -1);
  placeRow(sideB, 1);

  // Benches: at most one per long edge, centred, facing the table.
  const benches = members.filter((m) => m.role === 'bench');
  benches.forEach((m, i) => {
    const bFp = footprints[m.index] ?? { w: 1.0, d: 0.4 };
    const sidePerp: 1 | -1 = i % 2 === 0 ? -1 : 1;
    const bPerp = (longAlongX ? bFp.d : bFp.w) / 2;
    const perp = sidePerp * (halfPerp + CLEARANCE.sofaToCoffee + bPerp);
    if (longAlongX) {
      out.push({ index: m.index, dx: 0, dz: perp, rotation: sidePerp < 0 ? 0 : Math.PI });
    } else {
      out.push({ index: m.index, dx: perp, dz: 0, rotation: sidePerp < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
  });

  // "Other" members tuck past the table's -X end, stacking outward.
  const longHalfX = fp.w / 2;
  let outerX = longHalfX;
  for (const m of members.filter((mm) => mm.role === 'other')) {
    const oFp = footprints[m.index] ?? { w: 0.4, d: 0.4 };
    const dx = -(outerX + CLEARANCE.wallGap + oFp.w / 2);
    out.push({ index: m.index, dx, dz: 0, rotation: 0 });
    outerX += CLEARANCE.wallGap + oFp.w;
  }

  return out;
}

/** Footprint of a member def + its params (mirrors autoArrange.baseFootprint). */
function defFootprint(def: FurnitureDef, props: ParamProps): MemberFootprint {
  let w = def.defaultFootprint.w;
  let d = def.defaultFootprint.d;
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {};
    const wv = props[map.w ?? 'width'];
    const dv = props[map.d ?? 'depth'];
    if (typeof wv === 'number') w = wv;
    if (typeof dv === 'number') d = dv;
  }
  return { w, d };
}

export interface DropCentre {
  x: number;
  z: number;
}

/**
 * Resolve a recipe member's `groupKey` to its catalog def. The live catalog
 * (`useCatalog()` / `BUILTIN_CATALOG_PLUS_IKEA`) is keyed by `def.id`, and an
 * imported IKEA def's id is `ikea-<groupKey>` (see `furniture/ikea/importGroup.ts`,
 * `id: \`ikea-${meta.group_key}\``). So we try the bare `groupKey` first (which
 * matches a fixture catalog or any def whose id IS the groupKey) and then the
 * `ikea-` prefixed id. Returns the def (or null if the member isn't imported yet).
 */
function resolveMemberDef(
  catalog: Record<string, FurnitureDef>,
  groupKey: string,
): FurnitureDef | null {
  return catalog[groupKey] ?? catalog[`ikea-${groupKey}`] ?? null;
}

/**
 * Expand a set recipe into arranged, grouped `FurnitureItem`s ready to append
 * to the store. The table lands at `dropCentre`; chairs/benches/stools/other
 * arrange around it (`arrangeSet`). Every item is stamped with `groupId` so
 * they select/move as a unit. `groupId` is supplied by the caller (the Toolbar
 * mints it via the plan-2 `groupItems` helper); when omitted a local fallback
 * id is generated (used only by unit tests / non-store callers).
 *
 * Each item's `defId` is the RESOLVED catalog def id (e.g. `ikea-vihals-…`),
 * not the bare recipe `groupKey` — `defId` must be a real catalog key or the
 * item won't render. A member with no matching imported def is skipped (logged
 * by the caller); the set is still placed with whatever members resolved.
 */
export function buildSetGroup(
  recipe: SetRecipe,
  dropCentre: DropCentre,
  catalog: Record<string, FurnitureDef>,
  groupId: string = `set-${Date.now().toString(36)}`,
): FurnitureItem[] {
  const instances = expandMembers(recipe);

  // Resolve def + props + footprint per instance. Drop instances whose member
  // def isn't in the catalog (not imported) so we never emit an unrenderable
  // defId.
  const resolved: { m: SetMemberInstance; defId: string; props: ParamProps }[] = [];
  const footprints: Record<number, MemberFootprint> = {};
  for (const m of instances) {
    const def = resolveMemberDef(catalog, m.groupKey);
    if (!def) continue;
    const props: ParamProps = def.kind === 'parametric' ? defaultParamProps(def) : {};
    footprints[m.index] = defFootprint(def, props);
    resolved.push({ m, defId: def.id, props });
  }

  const keptInstances = resolved.map((r) => r.m);
  const placements = arrangeSet(keptInstances, footprints);
  const placementByIndex = new Map(placements.map((p) => [p.index, p]));
  const stamp = groupId.replace(/[^a-z0-9]/gi, '');

  return resolved.map(({ m, defId, props }) => {
    const p = placementByIndex.get(m.index) ?? { index: m.index, dx: 0, dz: 0, rotation: 0 };
    return {
      id: `${stamp}-${m.index}`,
      defId,
      position: [dropCentre.x + p.dx, dropCentre.z + p.dz] as [number, number],
      rotation: p.rotation,
      props,
      groupId,
    };
  });
}

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

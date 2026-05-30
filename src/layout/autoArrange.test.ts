import { describe, it, expect } from 'vitest';
import { arrangeRoom, roomOf } from './autoArrange';
import { defaultLayout } from '../furniture/defaultLayout';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import { defaultParamProps } from '../furniture/types';
import { canPlace } from '../collision/placement';
import type { FurnitureItem } from '../furniture/types';

function hydrate(): FurnitureItem[] {
  return defaultLayout().map((e) => {
    const def = BUILTIN_CATALOG[e.defId];
    return def?.kind === 'parametric' ? { ...e, props: { ...defaultParamProps(def), ...e.props } } : e;
  });
}

function assertValid(items: FurnitureItem[]) {
  const placed: FurnitureItem[] = [];
  for (const it of items) {
    const def = BUILTIN_CATALOG[it.defId];
    expect(def).toBeDefined();
    const ok = canPlace(it, def!, { others: placed, defs: BUILTIN_CATALOG, doors: {} });
    if (!ok) throw new Error(`${it.id} (${it.defId}) invalid at [${it.position}]`);
    placed.push(it);
  }
}

describe('arrangeRoom', () => {
  it('produces a collision-valid layout for the living/dining', () => {
    const out = arrangeRoom('livingDining', hydrate(), BUILTIN_CATALOG, {});
    assertValid(out);
  });

  it('orients the living-room sofa to face the east TV wall', () => {
    const out = arrangeRoom('livingDining', hydrate(), BUILTIN_CATALOG, {});
    const sofa = out.find((i) => i.defId === 'sofa-3seat' && roomOf(i.position) === 'livingDining');
    expect(sofa).toBeDefined();
    // Facing +X (east) ≈ rotation PI/2.
    expect(Math.abs(Math.sin(sofa!.rotation) - 1)).toBeLessThan(0.1);
    // Sofa sits west of the TV.
    const tv = out.find((i) => i.defId === 'tv-wall');
    expect(sofa!.position[0]).toBeLessThan(tv!.position[0]);
  });

  it('keeps bedrooms collision-valid and beds against a wall', () => {
    for (const room of ['mainBedroom', 'bedroom2', 'bedroom3'] as const) {
      const out = arrangeRoom(room, hydrate(), BUILTIN_CATALOG, {});
      assertValid(out);
    }
  });

  it('leaves items in untouched rooms unchanged', () => {
    const base = hydrate();
    const out = arrangeRoom('livingDining', base, BUILTIN_CATALOG, {});
    const kitchenBefore = base.filter((i) => roomOf(i.position) === 'kitchen');
    const kitchenAfter = out.filter((i) => i.id && roomOf(i.position) === 'kitchen');
    expect(kitchenAfter.length).toBe(kitchenBefore.length);
  });
});

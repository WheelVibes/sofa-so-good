import { describe, it, expect } from 'vitest';
import { arrangeRoom, arrangeAllRooms, arrangeAllRoomsForPlan, roomOf, roleForCategory } from './autoArrange';
import { buildDefaultPlan } from '../floorplan/defaultPlan';
import { blockedDoorItems } from './clearance';
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

  it('places a bed and a crib against walls in the same bedroom', () => {
    // A parents' room: just a double bed + a crib (clear floor) → both should
    // be placed validly (the crib snaps to a free wall, not left floating).
    const mk = (defId: string, id: string, pos: [number, number]): FurnitureItem => ({
      id,
      defId,
      position: pos,
      rotation: 0,
      props: { ...defaultParamProps(BUILTIN_CATALOG[defId] as never) },
    });
    const items = [mk('bed-double', 'test-bed', [7.1, 1.3]), mk('crib', 'test-crib', [7.5, 2.6])];
    const out = arrangeRoom('bedroom3', items, BUILTIN_CATALOG, {});
    assertValid(out);
    for (const id of ['test-bed', 'test-crib']) {
      const it = out.find((i) => i.id === id)!;
      expect(roomOf(it.position)).toBe('bedroom3');
    }
  });

  it('leaves items in untouched rooms unchanged', () => {
    const base = hydrate();
    const out = arrangeRoom('livingDining', base, BUILTIN_CATALOG, {});
    const kitchenBefore = base.filter((i) => roomOf(i.position) === 'kitchen');
    const kitchenAfter = out.filter((i) => i.id && roomOf(i.position) === 'kitchen');
    expect(kitchenAfter.length).toBe(kitchenBefore.length);
  });

  it('arrangeAllRooms produces a collision-valid whole-home layout', () => {
    const out = arrangeAllRooms(hydrate(), BUILTIN_CATALOG, {});
    expect(out.length).toBe(hydrate().length);
    assertValid(out);
  });

  it('arrangeAllRoomsForPlan tidies a custom plan validly, clearing door swings', () => {
    // The default flat as a plan, with its furniture distributed per room.
    const plan = buildDefaultPlan();
    const out = arrangeAllRoomsForPlan(plan, hydrate(), BUILTIN_CATALOG, {});
    expect(out.length).toBe(hydrate().length);
    assertValid(out);
    // No floor item ends up squarely in a door's path.
    expect(blockedDoorItems(out, BUILTIN_CATALOG, plan)).toHaveLength(0);
  });

  it('never parks furniture in the main-door swing / kitchen opening', () => {
    // Scramble L/D furniture into the entrance + openings, then tidy.
    const base = hydrate().map((i) =>
      i.id === 'default-ld-sofa'
        ? { ...i, position: [11.3, 7.4] as [number, number], rotation: 0 }
        : i.id === 'default-ld-coffee'
          ? { ...i, position: [9.4, 6.6] as [number, number] }
          : i,
    );
    const out = arrangeRoom('livingDining', base, BUILTIN_CATALOG, {});
    const keepouts = [
      { x0: 10.7, z0: 6.95, x1: 12.1, z1: 8.0 },
      { x0: 8.9, z0: 6.25, x1: 10.2, z1: 6.95 },
    ];
    const overlaps = (b: { x0: number; z0: number; x1: number; z1: number }, k: typeof keepouts[number]) =>
      b.x0 < k.x1 && b.x1 > k.x0 && b.z0 < k.z1 && b.z1 > k.z0;
    for (const it of out) {
      const def = BUILTIN_CATALOG[it.defId];
      if (!def || def.kind !== 'parametric' || def.mounted) continue;
      if (roomOf(it.position) !== 'livingDining') continue;
      let w = def.defaultFootprint.w;
      let d = def.defaultFootprint.d;
      const wv = it.props[def.footprintParams?.w ?? 'width'];
      const dv = it.props[def.footprintParams?.d ?? 'depth'];
      if (typeof wv === 'number') w = wv;
      if (typeof dv === 'number') d = dv;
      const c = Math.abs(Math.cos(it.rotation));
      const s = Math.abs(Math.sin(it.rotation));
      const hx = (c * w + s * d) / 2;
      const hz = (s * w + c * d) / 2;
      const box = { x0: it.position[0] - hx, z0: it.position[1] - hz, x1: it.position[0] + hx, z1: it.position[1] + hz };
      for (const k of keepouts) {
        if (overlaps(box, k)) throw new Error(`${it.id} (${it.defId}) blocks a door/opening at [${it.position}]`);
      }
    }
  });
});

describe('roleForCategory new categories', () => {
  it('maps the new IKEA-department categories to sensible roles', () => {
    expect(roleForCategory('electronics')).toBe('media');
    expect(roleForCategory('kids')).toBe('storage');
    expect(roleForCategory('laundry')).toBe('storage');
    expect(roleForCategory('others')).toBe('other');
  });
});

import { describe, it, expect } from 'vitest';
import { blockedDoorItems, doorSwingRects } from './clearance';
import { buildDefaultPlan } from '../floorplan/defaultPlan';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import { defaultParamProps } from '../furniture/types';
import type { FurnitureItem } from '../furniture/types';

const plan = buildDefaultPlan();

let seq = 0;
function mk(defId: string, pos: [number, number]): FurnitureItem {
  const def = BUILTIN_CATALOG[defId];
  return { id: `t-${defId}-${seq++}`, defId, position: pos, rotation: 0, props: { ...defaultParamProps(def as never) } };
}

describe('clearance', () => {
  it('derives one swing rect per door', () => {
    const rects = doorSwingRects(plan);
    const doors = plan.openings.filter((o) => o.kind === 'door').length;
    expect(rects.length).toBe(doors);
  });

  it('flags an item parked in a door swing, not one well clear', () => {
    const door = plan.openings.find((o) => o.kind === 'door')!;
    const wall = plan.walls.find((w) => w.id === door.wallId)!;
    const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const ux = (wall.end[0] - wall.start[0]) / len;
    const uz = (wall.end[1] - wall.start[1]) / len;
    // A sofa centred right in the doorway.
    const cx = wall.start[0] + ux * (door.offset + door.width / 2);
    const cz = wall.start[1] + uz * (door.offset + door.width / 2);
    const blocking = mk('sofa-3seat', [cx, cz]);
    const clear = mk('sofa-3seat', [cx + 50, cz + 50]); // far away
    const flagged = blockedDoorItems([blocking, clear], BUILTIN_CATALOG, plan);
    expect(flagged).toContain(blocking.id);
    expect(flagged).not.toContain(clear.id);
  });

  it('ignores mounted items (e.g. wall art) in a swing', () => {
    const door = plan.openings.find((o) => o.kind === 'door')!;
    const wall = plan.walls.find((w) => w.id === door.wallId)!;
    const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    const ux = (wall.end[0] - wall.start[0]) / len;
    const uz = (wall.end[1] - wall.start[1]) / len;
    const cx = wall.start[0] + ux * (door.offset + door.width / 2);
    const cz = wall.start[1] + uz * (door.offset + door.width / 2);
    const art = mk('wall-art', [cx, cz]);
    expect(blockedDoorItems([art], BUILTIN_CATALOG, plan)).not.toContain(art.id);
  });
});

import { ROOMS } from '../apartment/constants';
import { canPlace } from '../collision/placement';
import { CLEARANCE } from './designRules';
import { doorSwingRects } from './clearance';
import { wallLength, type FloorPlan, type PlanRoom } from '../floorplan/types';
import type { FurnitureDef, FurnitureItem } from '../furniture/types';
import type { RoomId } from '../apartment/types';

/**
 * Heuristic per-room auto-arranger ("Tidy up room"). Given the items already
 * in a room it returns a repositioned copy of the FULL item list, applying
 * interior-design rules grounded in the fixed apartment geometry:
 *   - storage / appliances / beds sit flush against walls, facing inward;
 *   - seating faces the focal wall (TV); the TV/console stay on a windowless
 *     wall; a coffee table + rug centre the lounge;
 *   - a dining set occupies the secondary zone with chairs tucked around it;
 *   - plants / floor lamps tuck into corners; walking gaps are preserved.
 * Every placement is collision-checked; an item that can't be placed is left
 * where it was, so the result is always valid.
 */

export type ArrangeRole =
  | 'media'
  | 'mediaConsole'
  | 'featureWall'
  | 'seating'
  | 'armchair'
  | 'lowTable'
  | 'rug'
  | 'diningTable'
  | 'diningChair'
  | 'bed'
  | 'nightstand'
  | 'storage'
  | 'desk'
  | 'deskChair'
  | 'plant'
  | 'floorLamp'
  | 'barCart'
  | 'shoe'
  | 'mounted'
  | 'ceiling'
  | 'other';

const ROLE: Record<string, ArrangeRole> = {
  'tv-wall': 'media',
  'flatscreen-tv': 'media',
  'tv-console': 'mediaConsole',
  'feature-wall': 'featureWall',
  'sofa-3seat': 'seating',
  'sofa-2seat': 'seating',
  'sofa-lshape': 'seating',
  armchair: 'armchair',
  'coffee-table': 'lowTable',
  'side-table': 'lowTable',
  'console-table': 'storage',
  sideboard: 'storage',
  rug: 'rug',
  'dining-table-4': 'diningTable',
  'dining-chair': 'diningChair',
  'bar-stool': 'diningChair',
  'bed-single': 'bed',
  'bed-double': 'bed',
  'bed-queen': 'bed',
  'bed-king': 'bed',
  'bunk-bed': 'bed',
  crib: 'bed',
  nightstand: 'nightstand',
  bookshelf: 'storage',
  'cube-shelf': 'storage',
  dresser: 'storage',
  'changing-table': 'storage',
  wardrobe: 'storage',
  'wardrobe-3door': 'storage',
  'shoe-cabinet': 'shoe',
  refrigerator: 'storage',
  'washing-machine': 'storage',
  bathtub: 'storage',
  desk: 'desk',
  'office-chair': 'deskChair',
  'potted-plant': 'plant',
  'floor-vase': 'plant',
  'bar-cart': 'barCart',
  'floor-lamp': 'floorLamp',
  'standing-fan': 'floorLamp',
  bench: 'lowTable',
  'wall-art': 'mounted',
  'wall-mirror': 'mounted',
  'bathroom-mirror': 'mounted',
  'wall-clock': 'mounted',
  'wall-shelf': 'mounted',
  'wall-sconce': 'mounted',
  'wall-cabinet': 'mounted',
  curtains: 'mounted',
  'roller-blind': 'mounted',
  'aircon-unit': 'mounted',
  'range-hood': 'mounted',
  soundbar: 'mounted',
  'ceiling-light': 'ceiling',
  'ceiling-fan': 'ceiling',
  'cove-light': 'mounted',
  'floor-mirror': 'storage',
  'table-lamp': 'other',
  'tabletop-decor': 'other',
};

function roleOf(defId: string): ArrangeRole {
  return ROLE[defId] ?? 'other';
}

/** Base (unrotated) footprint from the def + parametric overrides. */
function baseFootprint(item: FurnitureItem, def: FurnitureDef): { w: number; d: number } {
  let w = def.defaultFootprint.w;
  let d = def.defaultFootprint.d;
  if (def.kind === 'parametric') {
    const map = def.footprintParams ?? {};
    const wv = item.props[map.w ?? 'width'];
    const dv = item.props[map.d ?? 'depth'];
    if (typeof wv === 'number') w = wv;
    if (typeof dv === 'number') d = dv;
  }
  return { w, d };
}

/** Which room (by id) an [x,z] point falls in — main rect or extension. */
export function roomOf(position: [number, number]): RoomId | null {
  const [x, z] = position;
  for (const [id, r] of Object.entries(ROOMS) as [RoomId, (typeof ROOMS)[RoomId]][]) {
    const inMain =
      x >= r.origin[0] && x <= r.origin[0] + r.width && z >= r.origin[1] && z <= r.origin[1] + r.depth;
    let inExt = false;
    if (r.extension) {
      const ex = r.origin[0] + r.extension.offset[0];
      const ez = r.origin[1] + r.extension.offset[1];
      inExt = x >= ex && x <= ex + r.extension.width && z >= ez && z <= ez + r.extension.depth;
    }
    if (inMain || inExt) return id;
  }
  return null;
}

interface Ctx {
  catalog: Record<string, FurnitureDef>;
  doors: Record<string, { open: boolean }>;
  /** Keep-clear rects (door swings + room openings) no item may overlap. */
  keepOut: Rect[];
}

/** Axis-aligned footprint AABB of a candidate (accounts for rotation). */
function aabbOf(item: FurnitureItem, def: FurnitureDef, pos: [number, number], rot: number): Rect {
  const { w, d } = baseFootprint(item, def);
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const hx = (c * w + s * d) / 2;
  const hz = (s * w + c * d) / 2;
  return { x0: pos[0] - hx, z0: pos[1] - hz, x1: pos[0] + hx, z1: pos[1] + hz };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

/** Try to set an item's transform; accept only if it doesn't collide with the
 *  walls or any other item in `world`. Mutates `world` on success. Returns the
 *  (possibly unchanged) item. */
function tryPlace(
  item: FurnitureItem,
  pos: [number, number],
  rot: number,
  world: FurnitureItem[],
  ctx: Ctx,
): FurnitureItem {
  const def = ctx.catalog[item.defId];
  if (!def) return item;
  // Never place into a door swing / room opening (mounted/ceiling items are
  // exempt — they're on walls/ceiling, not the floor path).
  if (def.kind === 'parametric' && !def.mounted) {
    const box = aabbOf(item, def, pos, rot);
    if (ctx.keepOut.some((k) => rectsOverlap(box, k))) return item;
  }
  const candidate = { ...item, position: pos, rotation: rot };
  // `world` holds only obstacles: other-room items + already-placed items in
  // this room. Items still pending placement are NOT in `world`, so a messy
  // starting layout can't block the tidy target.
  const others = world.filter((w) => w.id !== item.id);
  if (canPlace(candidate, def, { others, defs: ctx.catalog, doors: ctx.doors })) {
    const idx = world.findIndex((w) => w.id === item.id);
    if (idx >= 0) world[idx] = candidate;
    else world.push(candidate);
    return candidate;
  }
  return item;
}

type Edge = 'N' | 'S' | 'E' | 'W';
interface Rect { x0: number; z0: number; x1: number; z1: number; }

/** Per-room usable-rect overrides where origin+width over-reports the free
 *  floor (e.g. the L/D lounge is bounded east of the b3 partition at x≈9.05,
 *  not the room origin at x=8.55). */
const RECT_OVERRIDE: Partial<Record<RoomId, Rect>> = {
  livingDining: { x0: 9.15, z0: 1.5, x1: 12.5, z1: 6.65 },
};

/** Usable rect for a room — main rectangle inset from the walls. */
function usableRect(roomId: RoomId): Rect {
  const o = RECT_OVERRIDE[roomId];
  if (o) return o;
  const r = ROOMS[roomId];
  const inset = 0.15;
  return {
    x0: r.origin[0] + inset,
    z0: r.origin[1] + inset,
    x1: r.origin[0] + r.width - inset,
    z1: r.origin[1] + r.depth - inset,
  };
}

/** Rooms whose seating should face a focal (TV) wall, and which edge it is. */
const FOCAL: Partial<Record<RoomId, Edge>> = { livingDining: 'E' };

/** Keep-clear rects per room: door swings + open passages between rooms, so
 *  the auto-arranger never blocks an entrance. Grounded in the fixed apartment
 *  geometry (DOORS/WALLS in apartment/constants.ts). */
const KEEPOUT: Partial<Record<RoomId, Rect[]>> = {
  livingDining: [
    { x0: 10.7, z0: 6.95, x1: 12.1, z1: 8.0 }, // main entrance + door swing
    { x0: 8.5, z0: 3.65, x1: 9.15, z1: 4.5 }, // corridor → L/D opening (SW)
    { x0: 8.9, z0: 6.25, x1: 10.2, z1: 6.95 }, // kitchen → L/D opening (S)
  ],
  bedroom2: [{ x0: 4.95, z0: 2.7, x1: 6.0, z1: 3.65 }], // bedroom-2 door swing
  bedroom3: [{ x0: 6.05, z0: 2.7, x1: 7.05, z1: 3.65 }], // bedroom-3 door swing
};

/** Inward-facing rotation + perpendicular extent for an edge. */
function inward(edge: Edge): number {
  return edge === 'N' ? 0 : edge === 'S' ? Math.PI : edge === 'W' ? Math.PI / 2 : -Math.PI / 2;
}

/** Snap an item flush against `edge`, keeping its along-wall coordinate
 *  (clamped), facing inward. Tries the given edge then falls back to others. */
function snapToWall(
  item: FurnitureItem,
  rect: Rect,
  edges: Edge[],
  world: FurnitureItem[],
  ctx: Ctx,
  gap = 0.06,
): FurnitureItem {
  const def = ctx.catalog[item.defId];
  if (!def) return item;
  const { w, d } = baseFootprint(item, def);
  for (const edge of edges) {
    const rot = inward(edge);
    // Perpendicular half-extent (depth d faces the wall) and along-wall half (w).
    const along = w / 2;
    let pos: [number, number];
    if (edge === 'N') pos = [clamp(item.position[0], rect.x0 + along, rect.x1 - along), rect.z0 + d / 2 + gap];
    else if (edge === 'S') pos = [clamp(item.position[0], rect.x0 + along, rect.x1 - along), rect.z1 - d / 2 - gap];
    else if (edge === 'W') pos = [rect.x0 + d / 2 + gap, clamp(item.position[1], rect.z0 + along, rect.z1 - along)];
    else pos = [rect.x1 - d / 2 - gap, clamp(item.position[1], rect.z0 + along, rect.z1 - along)];
    const placed = tryPlace(item, pos, rot, world, ctx);
    if (placed !== item) return placed;
  }
  return item;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Nearest edge of the rect to a point. */
function nearestEdge(pos: [number, number], rect: Rect): Edge {
  const d = { N: pos[1] - rect.z0, S: rect.z1 - pos[1], W: pos[0] - rect.x0, E: rect.x1 - pos[0] };
  return (Object.entries(d).sort((a, b) => a[1] - b[1])[0][0]) as Edge;
}

type RoomKind = 'living' | 'bedroom' | 'generic';
function roomKind(roomId: RoomId): RoomKind {
  if (roomId === 'livingDining') return 'living';
  if (roomId === 'mainBedroom' || roomId === 'bedroom2' || roomId === 'bedroom3') return 'bedroom';
  return 'generic';
}

type Getter = (roles: ArrangeRole[]) => FurnitureItem[];

/** Place an item flush to `edge` at an explicit along-wall coordinate. */
function placeFlush(
  item: FurnitureItem,
  rect: Rect,
  edge: Edge,
  along: number,
  world: FurnitureItem[],
  ctx: Ctx,
  gap: number = CLEARANCE.wallGap,
): FurnitureItem {
  const def = ctx.catalog[item.defId];
  if (!def) return item;
  const { d } = baseFootprint(item, def);
  const perpHalf = d / 2;
  let pos: [number, number];
  if (edge === 'N') pos = [along, rect.z0 + perpHalf + gap];
  else if (edge === 'S') pos = [along, rect.z1 - perpHalf - gap];
  else if (edge === 'W') pos = [rect.x0 + perpHalf + gap, along];
  else pos = [rect.x1 - perpHalf - gap, along];
  return tryPlace(item, pos, inward(edge), world, ctx);
}

/** Corners of the rect, slightly inset, for tucking accents. */
function cornersOf(rect: Rect): [number, number][] {
  return [
    [rect.x0 + 0.3, rect.z0 + 0.3],
    [rect.x1 - 0.3, rect.z0 + 0.3],
    [rect.x0 + 0.3, rect.z1 - 0.3],
    [rect.x1 - 0.3, rect.z1 - 0.3],
  ];
}
/** Last-resort placement: original transform, then corners, then a coarse
 *  grid sweep with a few rotations. Pushes the item into `world` wherever it
 *  first fits (leaves it out only if nothing fits). */
function settle(item: FurnitureItem, rect: Rect, world: FurnitureItem[], ctx: Ctx) {
  if (tryPlace(item, item.position, item.rotation, world, ctx) !== item) return;
  for (const c of cornersOf(rect)) if (tryPlace(item, c, item.rotation, world, ctx) !== item) return;
  const step = 0.3;
  for (const rot of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (let x = rect.x0 + 0.3; x <= rect.x1 - 0.3; x += step) {
      for (let z = rect.z0 + 0.3; z <= rect.z1 - 0.3; z += step) {
        if (tryPlace(item, [x, z], rot, world, ctx) !== item) return;
      }
    }
  }
}

function tuckCorners(items: FurnitureItem[], rect: Rect, world: FurnitureItem[], ctx: Ctx) {
  for (const it of items) {
    const sorted = [...cornersOf(rect)].sort(
      (a, b) =>
        Math.hypot(a[0] - it.position[0], a[1] - it.position[1]) -
        Math.hypot(b[0] - it.position[0], b[1] - it.position[1]),
    );
    for (const c of sorted) if (tryPlace(it, c, it.rotation, world, ctx) !== it) break;
  }
}

/**
 * Re-arrange the items in `roomId` and return the full updated item list.
 * Pure: input items are not mutated (copies are returned for moved items).
 * Strategy adapts to the room type (living / bedroom / generic).
 */
export function arrangeRoom(
  roomId: RoomId,
  allItems: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
): FurnitureItem[] {
  return arrangeCore({
    rect: usableRect(roomId),
    keepOut: KEEPOUT[roomId] ?? [],
    inRoom: (i) => roomOf(i.position) === roomId,
    kind: roomKind(roomId),
    focal: FOCAL[roomId],
    allItems,
    catalog,
    doors,
  });
}

/** Shared arranger core: place every item matching `inRoom` within `rect`
 *  using the strategy for `kind`, against the other items as obstacles. */
function arrangeCore(opts: {
  rect: Rect;
  keepOut: Rect[];
  inRoom: (i: FurnitureItem) => boolean;
  kind: RoomKind;
  focal: Edge | undefined;
  /** Use the edge-generic living arranger (custom plans) vs the tuned default. */
  genericLiving?: boolean;
  allItems: FurnitureItem[];
  catalog: Record<string, FurnitureDef>;
  doors: Record<string, { open: boolean }>;
}): FurnitureItem[] {
  const { rect, keepOut, inRoom, kind, focal, genericLiving, allItems, catalog, doors } = opts;
  const ctx: Ctx = { catalog, doors, keepOut };
  const isFixed = (i: FurnitureItem) => {
    const r = roleOf(i.defId);
    return r === 'mounted' || r === 'ceiling';
  };
  // `world` starts with the OTHER rooms' items + this room's FIXED pieces
  // (wall/ceiling mounts — aircon, range hood, sconces…), all kept at their
  // current transform as obstacles so floor furniture isn't parked under them.
  const world: FurnitureItem[] = allItems.filter((i) => !inRoom(i) || isFixed(i)).map((i) => ({ ...i }));
  // Movable room items are placed one-by-one so pending ones can't block.
  const roomItems = allItems.filter((i) => inRoom(i) && !isFixed(i)).map((i) => ({ ...i }));
  const get: Getter = (roles) => roomItems.filter((i) => roles.includes(roleOf(i.defId)));

  if (kind === 'living') {
    if (genericLiving) arrangeLivingAnyEdge(rect, focal, get, world, ctx, catalog);
    else arrangeLiving(rect, focal, get, world, ctx, catalog);
  } else if (kind === 'bedroom') arrangeBedroom(rect, get, world, ctx, catalog);
  else arrangeGeneric(rect, get, world, ctx);

  // Safety settle: any room item not yet placed (unhandled role or no slot)
  // gets a valid spot — original first, then corners, then a coarse grid —
  // so the result stays collision-free for floor items.
  const inWorld = new Set(world.map((w) => w.id));
  for (const it of roomItems) {
    if (inWorld.has(it.id)) continue;
    if (roleOf(it.defId) === 'mounted' || roleOf(it.defId) === 'ceiling') continue;
    settle(it, rect, world, ctx);
  }

  // Rebuild the full list in original order: a placed item takes its new
  // transform from `world`; an unplaced room item keeps its original transform.
  const byId = new Map(world.map((w) => [w.id, w]));
  return allItems.map((orig) => byId.get(orig.id) ?? orig);
}

/** Opposite of a wall edge. */
function opposite(e: Edge): Edge {
  return e === 'N' ? 'S' : e === 'S' ? 'N' : e === 'E' ? 'W' : 'E';
}

/**
 * Edge-generic living/dining arranger (any focal wall, not just east). Used for
 * user-authored plans whose TV wall can face any direction. Places media flush
 * to the focal wall, seating flush to the opposite wall facing it, rug+coffee
 * between them, the dining set at the far end, accents to walls/corners.
 */
function arrangeLivingAnyEdge(
  rect: Rect,
  focal: Edge | undefined,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const fpOf = (it: FurnitureItem) => baseFootprint(it, catalog[it.defId]);

  const vertical = focal === 'E' || focal === 'W'; // focal wall runs along Z
  const alongMin = vertical ? rect.z0 : rect.x0;
  const alongMax = vertical ? rect.z1 : rect.x1;
  const depthMin = vertical ? rect.x0 : rect.z0;
  const depthMax = vertical ? rect.x1 : rect.z1;
  const depthOf = (p: [number, number]) => (vertical ? p[0] : p[1]);
  const alongOf = (p: [number, number]) => (vertical ? p[1] : p[0]);
  const build = (along: number, depth: number): [number, number] => (vertical ? [depth, along] : [along, depth]);
  const inSign = (e: Edge) => (e === 'E' || e === 'S' ? -1 : 1);

  const sofa = get(['seating'])[0];
  const alongCenter = sofa ? clamp(alongOf(sofa.position), alongMin + 1, alongMax - 1) : (alongMin + alongMax) / 2;

  // 1. Media + TV + feature wall flush to the focal wall.
  let consoleFront: number | null = null;
  if (focal) {
    const console = get(['mediaConsole'])[0];
    if (console) {
      const placed = placeFlush(console, rect, focal, alongCenter, world, ctx);
      if (placed !== console) consoleFront = depthOf(placed.position) + inSign(focal) * (fpOf(console).d / 2);
    }
    for (const m of get(['media', 'featureWall'])) {
      placeFlush(m, rect, focal, alongCenter, world, ctx, m.defId === 'feature-wall' ? 0.02 : 0.1);
    }
  }

  // 2. Seating flush to the opposite wall, facing the focal wall.
  let sofaFront: number | null = null;
  if (sofa) {
    let placed: FurnitureItem | null = null;
    if (focal) placed = placeFlush(sofa, rect, opposite(focal), alongCenter, world, ctx);
    if (placed && placed !== sofa) sofaFront = depthOf(placed.position) + inSign(opposite(focal!)) * (fpOf(sofa).d / 2);
    else snapToWall(sofa, rect, [nearestEdge(sofa.position, rect)], world, ctx);
  }

  // 3. Rug + coffee between sofa and media (long side parallel to the sofa).
  const depthMid = consoleFront != null && sofaFront != null ? (consoleFront + sofaFront) / 2 : (depthMin + depthMax) / 2;
  for (const rug of get(['rug'])) tryPlace(rug, build(alongCenter, depthMid), 0, world, ctx);
  for (const t of get(['lowTable'])) {
    const fp = fpOf(t);
    const rot = vertical ? (fp.w > fp.d ? Math.PI / 2 : 0) : fp.w > fp.d ? 0 : Math.PI / 2;
    tryPlace(t, build(alongCenter, depthMid), rot, world, ctx);
  }

  // 4. Dining at the far end of the along axis; chairs on the two depth sides.
  const dining = get(['diningTable'])[0];
  if (dining) {
    const mid = (alongMin + alongMax) / 2;
    const span = alongMax - alongMin;
    const diningAlong = alongCenter < mid ? alongMax - span * 0.26 : alongMin + span * 0.26;
    const diningDepth = clamp((depthMin + depthMax) / 2, depthMin + 1, depthMax - 1);
    const fp0 = fpOf(dining);
    const tableRot = vertical ? (fp0.w > fp0.d ? Math.PI / 2 : 0) : fp0.w > fp0.d ? 0 : Math.PI / 2;
    const placed = tryPlace(dining, build(diningAlong, diningDepth), tableRot, world, ctx);
    const fp = fpOf(placed);
    const c = Math.abs(Math.cos(tableRot));
    const s = Math.abs(Math.sin(tableRot));
    const exAlong = vertical ? (s * fp.w + c * fp.d) / 2 : (c * fp.w + s * fp.d) / 2;
    const exDepth = vertical ? (c * fp.w + s * fp.d) / 2 : (s * fp.w + c * fp.d) / 2;
    const tAlong = alongOf(placed.position);
    const tDepth = depthOf(placed.position);
    const chairs = get(['diningChair']);
    const nA = Math.ceil(chairs.length / 2);
    const spread = (n: number, w: number) =>
      Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -w / 2 + (w * i) / (n - 1)));
    const sideA = spread(nA, exAlong * 2 - 0.4);
    const sideB = spread(chairs.length - nA, exAlong * 2 - 0.4);
    const faceToward = (sign: number): number =>
      vertical ? (sign > 0 ? Math.PI / 2 : -Math.PI / 2) : sign > 0 ? 0 : Math.PI;
    chairs.forEach((ch, i) => {
      if (i < nA) tryPlace(ch, build(tAlong + sideA[i], tDepth - (exDepth + 0.32)), faceToward(1), world, ctx);
      else tryPlace(ch, build(tAlong + sideB[i - nA], tDepth + (exDepth + 0.32)), faceToward(-1), world, ctx);
    });
  }

  // 5. Storage / desk / shoe / accents → walls + corners.
  for (const it of get(['storage', 'desk'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx);
  }
  for (const it of get(['shoe'])) snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx);
  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx);
  for (const it of get(['armchair'])) snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx);
  void cx;
  void cz;
}

/** Living/dining: media on focal wall, seating facing it, coffee+rug centred,
 *  dining set in the secondary zone, storage flush, accents in corners. */
function arrangeLiving(
  rect: Rect,
  focal: Edge | undefined,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;

  // 1. Media console + TV + feature wall + cove → focal wall (flush).
  let consoleFrontX = rect.x1; // for placing seating opposite
  let consoleZ = cz;
  if (focal) {
    const console = get(['mediaConsole'])[0];
    const seatingRef = get(['seating'])[0];
    consoleZ = seatingRef ? clamp(seatingRef.position[1], rect.z0 + 1, rect.z1 - 1) : rect.z0 + (rect.z1 - rect.z0) * 0.28;
    if (console) {
      const def = catalog[console.defId];
      const d = def ? baseFootprint(console, def).d : 0.4;
      snapToWall(console, rect, [focal], world, ctx);
      // shift to the seating z band (only if it actually got placed)
      const placedConsole = world.find((w) => w.id === console.id);
      if (placedConsole) {
        tryPlace(placedConsole, [rect.x1 - d / 2 - 0.06, consoleZ], inward(focal), world, ctx);
        consoleFrontX = rect.x1 - d - 0.06;
      }
    }
    for (const m of get(['media', 'featureWall'])) {
      const off = m.defId === 'feature-wall' ? 0.02 : 0.12;
      tryPlace(m, [rect.x1 - off, consoleZ], inward(focal), world, ctx);
    }
  }

  // 2. Seating → face the focal wall, opposite side; else face room centre.
  const sofa = get(['seating'])[0];
  let sofaFrontX = rect.x0;
  if (sofa && focal === 'E') {
    const def = catalog[sofa.defId];
    const d = def ? baseFootprint(sofa, def).d : 0.9;
    // Back flush to the west wall (rect.x0 is the wall face + tiny gap).
    const px = rect.x0 + d / 2 + CLEARANCE.wallGap;
    tryPlace(sofa, [px, consoleZ], Math.PI / 2, world, ctx);
    sofaFrontX = px + d / 2;
  } else if (sofa) {
    snapToWall(sofa, rect, [nearestEdge(sofa.position, rect)], world, ctx);
  }

  // 3. Low table + rug between sofa and console (long side parallel to sofa).
  const midX = focal === 'E' ? (sofaFrontX + consoleFrontX) / 2 : cx;
  for (const rug of get(['rug'])) tryPlace(rug, [midX, consoleZ], 0, world, ctx);
  for (const t of get(['lowTable'])) {
    // A coffee table's long side should be parallel to the (N-S) sofa → rot 90°.
    const def = catalog[t.defId];
    const fp = def ? baseFootprint(t, def) : { w: 1, d: 1 };
    const rot = focal === 'E' && fp.w > fp.d ? Math.PI / 2 : 0;
    tryPlace(t, [midX, consoleZ], rot, world, ctx);
  }

  // 4. Dining table + chairs → secondary zone (far half from the lounge).
  const dining = get(['diningTable'])[0];
  if (dining) {
    const dz = focal === 'E' ? rect.z0 + (rect.z1 - rect.z0) * 0.74 : cz;
    const dx = clamp(dining.position[0], rect.x0 + 1, rect.x1 - 1);
    const placed = tryPlace(dining, [dx, dz], 0, world, ctx);
    const def = catalog[placed.defId];
    const fp = def ? baseFootprint(placed, def) : { w: 1.4, d: 0.85 };
    const chairs = get(['diningChair']);
    // Distribute: long (north/south) sides first, then ends.
    const slots: { pos: [number, number]; rot: number }[] = [];
    const half = chairs.length <= 4 ? Math.ceil(chairs.length / 2) : Math.ceil(chairs.length / 2);
    const nNorth = Math.ceil(chairs.length / 2);
    const spread = (n: number, span: number) =>
      Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -span / 2 + (span * i) / (n - 1)));
    void half;
    const northXs = spread(nNorth, fp.w - 0.4);
    const southXs = spread(chairs.length - nNorth, fp.w - 0.4);
    for (const ox of northXs) slots.push({ pos: [placed.position[0] + ox, placed.position[1] - fp.d / 2 - 0.32], rot: 0 });
    for (const ox of southXs) slots.push({ pos: [placed.position[0] + ox, placed.position[1] + fp.d / 2 + 0.32], rot: Math.PI });
    chairs.forEach((ch, i) => {
      const slot = slots[i];
      if (slot) tryPlace(ch, slot.pos, slot.rot, world, ctx);
    });
  }

  // 5. Storage / desk / appliances → flush to nearest wall, facing in.
  for (const it of get(['storage', 'desk'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx);
  }
  for (const it of get(['shoe'])) snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx);

  // 6. Plants + floor lamps + armchairs → corners / nearest wall.
  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx);
  for (const it of get(['armchair'])) snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx);
  void cx;
}

/** Bedroom: bed centred & headboard flush to a wall, nightstands flanking,
 *  wardrobe/storage on another wall (door-swing clearance via collision),
 *  a foot-of-bed bench if it fits, accents in corners. */
function arrangeBedroom(
  rect: Rect,
  get: Getter,
  world: FurnitureItem[],
  ctx: Ctx,
  catalog: Record<string, FurnitureDef>,
) {
  const bed = get(['bed'])[0];
  let bedEdge: Edge = 'N';
  let bedAlong = (rect.x0 + rect.x1) / 2;
  let bedW = 1.4;
  let bedFootZ = rect.z1; // foot plane (for the bench)
  if (bed) {
    const def = catalog[bed.defId];
    const fp = def ? baseFootprint(bed, def) : { w: 1.4, d: 2.0 };
    bedW = fp.w;
    // Headboard wall: the bed's nearest wall, centred along it for balance.
    bedEdge = nearestEdge(bed.position, rect);
    const horizontal = bedEdge === 'N' || bedEdge === 'S';
    bedAlong = horizontal ? (rect.x0 + rect.x1) / 2 : (rect.z0 + rect.z1) / 2;
    const placed = placeFlush(bed, rect, bedEdge, bedAlong, world, ctx);
    // Foot plane = bed centre + half-length away from the headboard wall.
    const len = fp.d;
    if (bedEdge === 'N') bedFootZ = placed.position[1] + len / 2;
    else if (bedEdge === 'S') bedFootZ = placed.position[1] - len / 2;

    // Nightstands flank the headboard along the same wall.
    const stands = get(['nightstand']);
    stands.forEach((ns, i) => {
      const nsDef = catalog[ns.defId];
      const nsW = nsDef ? baseFootprint(ns, nsDef).w : 0.45;
      const side = i === 0 ? -1 : 1;
      const along = bedAlong + side * (bedW / 2 + nsW / 2 + 0.05);
      placeFlush(ns, rect, bedEdge, along, world, ctx);
    });
  }

  // Wardrobe / storage / desk → a wall other than the headboard wall if it
  // fits there, else the nearest wall. Collision enforces door-swing gaps.
  const otherEdges: Edge[] = (['S', 'W', 'E', 'N'] as Edge[]).filter((e) => e !== bedEdge);
  for (const it of get(['storage', 'desk'])) {
    snapToWall(it, rect, [...otherEdges, bedEdge], world, ctx);
  }
  // Additional beds / cribs (e.g. a cot in the parents' room) snap to a free
  // wall — they aren't the primary bed so they read as a secondary sleeping
  // station against the perimeter.
  for (const extra of get(['bed']).slice(1)) {
    snapToWall(extra, rect, [...otherEdges, bedEdge], world, ctx);
  }
  placeDeskChairs(get(['desk']), get(['deskChair']), rect, world, ctx);

  // Rug: centred under the lower half of the bed, extending toward the foot
  // (noClip, so it always places — it just sits under everything).
  for (const rug of get(['rug'])) {
    if (bedEdge === 'N' || bedEdge === 'S') {
      const rz = bedEdge === 'N' ? bedFootZ - 0.4 : bedFootZ + 0.4;
      tryPlace(rug, [bedAlong, rz], 0, world, ctx);
    } else {
      tryPlace(rug, [(rect.x0 + rect.x1) / 2, bedAlong], 0, world, ctx);
    }
  }

  // Foot-of-bed bench, centred at the foot if there's room.
  for (const b of get(['lowTable'])) {
    if (bedEdge === 'N' || bedEdge === 'S') {
      const bz = bedEdge === 'N' ? bedFootZ + 0.25 : bedFootZ - 0.25;
      if (tryPlace(b, [bedAlong, bz], 0, world, ctx) !== b) continue;
    }
    snapToWall(b, rect, [nearestEdge(b.position, rect)], world, ctx);
  }

  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx);
}

/** Place each desk chair just in front of its nearest desk, facing it (so a
 *  study nook reads as a set rather than a chair stranded against a wall). */
function placeDeskChairs(
  desks: FurnitureItem[],
  chairs: FurnitureItem[],
  rect: Rect,
  world: FurnitureItem[],
  ctx: Ctx,
) {
  for (const ch of chairs) {
    // Use the desk's PLACED transform from `world` where available.
    let best: FurnitureItem | undefined;
    let bestD = Infinity;
    for (const d of desks) {
      const placed = world.find((w) => w.id === d.id) ?? d;
      const dist = Math.hypot(placed.position[0] - ch.position[0], placed.position[1] - ch.position[1]);
      if (dist < bestD) {
        bestD = dist;
        best = placed;
      }
    }
    if (best) {
      const f: [number, number] = [Math.sin(best.rotation), Math.cos(best.rotation)];
      const pos: [number, number] = [best.position[0] + f[0] * 0.55, best.position[1] + f[1] * 0.55];
      if (tryPlace(ch, pos, best.rotation + Math.PI, world, ctx) !== ch) continue;
    }
    snapToWall(ch, rect, [nearestEdge(ch.position, rect)], world, ctx);
  }
}

/** Generic (kitchen / bathroom / utility): push wall-backed pieces flush to
 *  their nearest wall facing in, tuck accents into corners. */
function arrangeGeneric(rect: Rect, get: Getter, world: FurnitureItem[], ctx: Ctx) {
  for (const it of get(['storage', 'desk', 'bed', 'mediaConsole', 'shoe'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect), 'N', 'S', 'W', 'E'], world, ctx);
  }
  placeDeskChairs(get(['desk']), get(['deskChair']), rect, world, ctx);
  for (const it of get(['seating', 'armchair', 'diningChair'])) {
    snapToWall(it, rect, [nearestEdge(it.position, rect)], world, ctx);
  }
  tuckCorners(get(['plant', 'floorLamp', 'barCart']), rect, world, ctx);
}

/** Rooms the "Tidy home" action arranges (every furnished interior room;
 *  skips the corridor passage and the external AC ledge). */
const ARRANGEABLE_ROOMS: RoomId[] = [
  'livingDining',
  'mainBedroom',
  'bedroom2',
  'bedroom3',
  'kitchen',
  'bath1',
  'bath2',
  'householdShelter',
  'serviceYard',
];

/** Arrange every room in turn, threading each result into the next. */
export function arrangeAllRooms(
  allItems: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
): FurnitureItem[] {
  return ARRANGEABLE_ROOMS.reduce((items, room) => arrangeRoom(room, items, catalog, doors), allItems);
}

// ── User-authored floor plans ──────────────────────────────────────────────

/** Usable rect for a plan room — its interior rectangle inset from the walls. */
function planRoomRect(r: PlanRoom): Rect {
  const inset = 0.12;
  return {
    x0: r.origin[0] + inset,
    z0: r.origin[1] + inset,
    x1: r.origin[0] + r.width - inset,
    z1: r.origin[1] + r.depth - inset,
  };
}

/** Is a point inside a plan room (main rect or its L-shape extension)? */
function pointInPlanRoom(r: PlanRoom, x: number, z: number): boolean {
  const inMain = x >= r.origin[0] && x <= r.origin[0] + r.width && z >= r.origin[1] && z <= r.origin[1] + r.depth;
  if (inMain) return true;
  if (r.extension) {
    const ex = r.origin[0] + r.extension.offset[0];
    const ez = r.origin[1] + r.extension.offset[1];
    return x >= ex && x <= ex + r.extension.width && z >= ez && z <= ez + r.extension.depth;
  }
  return false;
}

/** Classify a custom room from the items currently in it. */
function roomKindFromItems(items: FurnitureItem[]): RoomKind {
  const roles = new Set(items.map((i) => roleOf(i.defId)));
  if (roles.has('bed')) return 'bedroom';
  if (roles.has('seating') || roles.has('media') || roles.has('mediaConsole')) return 'living';
  return 'generic';
}

/** World centre of a window opening (for focal-wall inference). */
function windowCentres(plan: FloorPlan): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (const o of plan.openings) {
    if (o.kind !== 'window') continue;
    const wall = plan.walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const len = wallLength(wall);
    if (len === 0) continue;
    const ux = (wall.end[0] - wall.start[0]) / len;
    const uz = (wall.end[1] - wall.start[1]) / len;
    pts.push([wall.start[0] + ux * (o.offset + o.width / 2), wall.start[1] + uz * (o.offset + o.width / 2)]);
  }
  return pts;
}

/** Pick a windowless edge of `rect` for a TV/media wall (prefer E, N, S, W). */
function inferFocal(rect: Rect, windows: Array<[number, number]>): Edge | undefined {
  const tol = 0.5;
  const hasWindow = (edge: Edge): boolean =>
    windows.some(([wx, wz]) => {
      if (edge === 'N') return Math.abs(wz - rect.z0) < tol && wx > rect.x0 - tol && wx < rect.x1 + tol;
      if (edge === 'S') return Math.abs(wz - rect.z1) < tol && wx > rect.x0 - tol && wx < rect.x1 + tol;
      if (edge === 'W') return Math.abs(wx - rect.x0) < tol && wz > rect.z0 - tol && wz < rect.z1 + tol;
      return Math.abs(wx - rect.x1) < tol && wz > rect.z0 - tol && wz < rect.z1 + tol;
    });
  for (const e of ['E', 'N', 'S', 'W'] as Edge[]) if (!hasWindow(e)) return e;
  return undefined;
}

/**
 * Tidy a user-authored floor plan: arrange each plan room with the room-type
 * strategy (inferred from its contents), keeping clear of every door swing.
 * Used by "Tidy home" when a non-default plan is active.
 */
export function arrangeAllRoomsForPlan(
  plan: FloorPlan,
  allItems: FurnitureItem[],
  catalog: Record<string, FurnitureDef>,
  doors: Record<string, { open: boolean }>,
): FurnitureItem[] {
  const keepOut = doorSwingRects(plan);
  const windows = windowCentres(plan);
  let items = allItems;
  for (const room of plan.rooms) {
    const inRoom = (i: FurnitureItem) => pointInPlanRoom(room, i.position[0], i.position[1]);
    const roomItems = items.filter(inRoom);
    if (roomItems.length === 0) continue;
    const rect = planRoomRect(room);
    const kind = roomKindFromItems(roomItems);
    items = arrangeCore({
      rect,
      keepOut,
      inRoom,
      kind,
      // Custom living rooms use the edge-generic arranger, facing seating to a
      // windowless wall in whatever direction it lies.
      focal: kind === 'living' ? inferFocal(rect, windows) : undefined,
      genericLiving: true,
      allItems: items,
      catalog,
      doors,
    });
  }
  return items;
}

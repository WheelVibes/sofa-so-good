export type RoomId =
  | 'mainBedroom'
  | 'bedroom2'
  | 'bedroom3'
  | 'bath1'
  | 'bath2'
  | 'livingDining'
  | 'kitchen'
  | 'serviceYard'
  | 'householdShelter'
  | 'acLedge';

export type DoorId = string;
export type WindowId = string;

/** Position in metres from the apartment origin (0,0 at NW external corner, +X east, +Z south). */
export type Vec2 = readonly [number, number];

export interface RoomDef {
  id: RoomId;
  name: string;
  /** NW corner of the *interior* of the room (after wall thickness). */
  origin: Vec2;
  /** Interior width (X-axis). */
  width: number;
  /** Interior depth (Z-axis). */
  depth: number;
  /** Optional ceiling override; defaults to FLAT.ceilingHeight. */
  ceilingHeight?: number;
  external?: boolean;
  /** Free-form derivation note for traceability (see spec §6.2). */
  derivation?: string;
}

export type CutoutKind = 'door' | 'window';

export interface Cutout {
  kind: CutoutKind;
  /** Distance from wall start at floor level (X-axis along the wall). */
  offset: number;
  /** Cutout width along the wall. */
  width: number;
  /** Bottom edge height above floor. */
  sill: number;
  /** Top edge height above floor. */
  head: number;
  /** Reference to a DoorSpec or WindowSpec id, when relevant. */
  refId?: string;
}

export interface WallSpec {
  id: string;
  start: Vec2;
  end: Vec2;
  thickness: 'external' | 'internal';
  cutouts: Cutout[];
}

export interface DoorSpec {
  id: DoorId;
  /** Wall id this door cuts through. */
  wallId: string;
  /** Distance along the wall (must match a Cutout.offset on that wall). */
  offset: number;
  width: number;
  /** Hinge side relative to wall direction. */
  hinge: 'start' | 'end';
  /** Which side the door swings into. */
  swing: 'left' | 'right';
  /** Initial state. */
  defaultOpen: boolean;
}

export interface WindowSpec {
  id: WindowId;
  wallId: string;
  offset: number;
  width: number;
  sill: number;
  head: number;
}

export interface FlatSpec {
  ceilingHeight: number;
  bathroomCeilingHeight: number;
  externalWallThickness: number;
  internalWallThickness: number;
  doorHeight: number;
  mainDoorWidth: number;
  internalDoorWidth: number;
  bedroomWindowSill: number;
  windowHeadHeight: number;
}

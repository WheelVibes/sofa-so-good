import { ROOMS } from '../../apartment/constants';
import { roomDaylightFactor } from '../../apartment/daylight';
import { buildRoomGraph, relaxDaylight } from '../../apartment/roomGraph';
import type { DoorState } from '../../state/slices/doorsSlice';
import type { RoomId } from '../../apartment/types';
import { daylightAdmittance } from './altitudeCurve';

export interface RoomIntensities {
  ambientFill: number;
  windowInjector: number;
}

const ALL_ROOM_IDS = Object.keys(ROOMS) as RoomId[];

export const AMBIENT_FILL_GAIN = 0.9;
export const WINDOW_INJECTOR_GAIN = 1.4;

export function computeRoomDaylightIntensities(
  sunDir: readonly [number, number, number],
  sunAltRad: number,
  doorState: Record<string, DoorState>,
): Record<RoomId, RoomIntensities> {
  const admit = daylightAdmittance(sunAltRad);
  const base = {} as Record<RoomId, number>;
  for (const id of ALL_ROOM_IDS) {
    base[id] = ROOMS[id].external ? 0 : roomDaylightFactor(id, sunDir);
  }
  const graph = buildRoomGraph(doorState);
  const relaxed = relaxDaylight(base, graph);

  const out = {} as Record<RoomId, RoomIntensities>;
  for (const id of ALL_ROOM_IDS) {
    if (ROOMS[id].external) {
      out[id] = { ambientFill: 0, windowInjector: 0 };
      continue;
    }
    out[id] = {
      ambientFill: admit * relaxed[id] * AMBIENT_FILL_GAIN,
      windowInjector: admit * base[id] * WINDOW_INJECTOR_GAIN,
    };
  }
  return out;
}

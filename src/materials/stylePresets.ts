import type { RoomId } from '../apartment/types';
import type { MaterialId } from './types';

/**
 * One-click design styles: a coordinated floor + wall palette applied to the
 * main living spaces (bedrooms, living/dining, corridor). Wet rooms and
 * utility spaces keep their hard-wearing finishes — a style sets the
 * "designed" surfaces, not the bathroom tiling.
 */
export interface StylePreset {
  id: string;
  name: string;
  /** Floor finish for the dry living spaces. */
  dryFloor: MaterialId;
  /** Wall paint for the dry living spaces. */
  wall: MaterialId;
}

/** Rooms a style restyles (the "designed" living spaces). */
export const STYLE_ROOMS: RoomId[] = [
  'mainBedroom',
  'bedroom2',
  'bedroom3',
  'livingDining',
  'corridor',
];

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'scandi', name: 'Scandinavian', dryFloor: 'floor-wood-oak', wall: 'wall-paint-white' },
  { id: 'warm', name: 'Warm Minimal', dryFloor: 'floor-wood-oak', wall: 'wall-paint-warm' },
  { id: 'industrial', name: 'Industrial', dryFloor: 'floor-tile-charcoal', wall: 'wall-paint-greige' },
  { id: 'tropical', name: 'Tropical', dryFloor: 'floor-wood-teak', wall: 'wall-paint-sage' },
  { id: 'mono', name: 'Modern Mono', dryFloor: 'floor-tile-grey', wall: 'wall-paint-charcoal' },
];

/** Apply a style across the living spaces via the finish setters. */
export function applyStyle(
  preset: StylePreset,
  setFloorFinish: (room: RoomId, id: MaterialId) => void,
  setWallFinish: (room: RoomId, id: MaterialId) => void,
): void {
  for (const room of STYLE_ROOMS) {
    setFloorFinish(room, preset.dryFloor);
    setWallFinish(room, preset.wall);
  }
}

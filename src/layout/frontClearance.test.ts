import { describe, it, expect } from 'vitest';
import { frontClearanceRect } from './clearance';
import type { FurnitureItem, FurnitureDef } from '../furniture/types';

const def = {
  id: 'x', name: 'x', category: 'storage', kind: 'parametric', primitive: 'Sideboard',
  paramSchema: [], defaultFootprint: { w: 1, d: 0.4, h: 0.8 }, frontClearance: 0.75,
} as unknown as FurnitureDef;

function item(rotation: number): FurnitureItem {
  return { id: 'i', defId: 'x', position: [2, 3], rotation, props: {} };
}

describe('frontClearanceRect', () => {
  it('projects a strip in front (+Z at rotation 0) of the item', () => {
    const rect = frontClearanceRect(item(0), def);
    expect(rect).not.toBeNull();
    if (!rect) return;
    // +Z front at rotation 0 → the strip lies at z greater than the item's z (3)
    const cz = (rect.z0 + rect.z1) / 2;
    expect(cz).toBeGreaterThan(3);
    // strip depth ≈ frontClearance (0.75) along z
    expect(Math.abs(rect.z1 - rect.z0)).toBeCloseTo(0.75, 2);
    // strip width ≈ item width (1) along x
    expect(Math.abs(rect.x1 - rect.x0)).toBeCloseTo(1, 2);
  });
  it('rotates the strip with the item (90° → strip extends along x)', () => {
    const rect = frontClearanceRect(item(Math.PI / 2), def);
    expect(rect).not.toBeNull();
    if (!rect) return;
    const cx = (rect.x0 + rect.x1) / 2;
    // at +90° yaw, local +Z maps toward +x (or -x depending on sign) — just assert the strip is offset in x, not z
    expect(Math.abs(cx - 2)).toBeGreaterThan(0.2);
    expect(Math.abs((rect.z0 + rect.z1) / 2 - 3)).toBeLessThan(0.4);
  });
  it('returns null when the def has no frontClearance', () => {
    const bare = { ...def, frontClearance: undefined } as FurnitureDef;
    expect(frontClearanceRect(item(0), bare)).toBeNull();
  });
  it('returns null when frontClearance is 0', () => {
    const zero = { ...def, frontClearance: 0 } as FurnitureDef;
    expect(frontClearanceRect(item(0), zero)).toBeNull();
  });
});

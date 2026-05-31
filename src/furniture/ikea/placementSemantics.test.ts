import { describe, it, expect } from 'vitest';
import { placementKind } from './placementSemantics';

describe('placementKind', () => {
  it('classifies mattresses + bed bases as vertical', () => {
    expect(placementKind('Foam & latex mattresses')).toBe('vertical');
    expect(placementKind('Spring mattresses')).toBe('vertical');
    expect(placementKind('Slatted bed bases')).toBe('vertical');
  });

  it('classifies seating-around-a-table as around', () => {
    expect(placementKind('Kitchen dining chairs')).toBe('around');
    expect(placementKind('Stools')).toBe('around');
    expect(placementKind('Dining benches')).toBe('around');
    expect(placementKind('Upholstered chairs')).toBe('around');
    expect(placementKind('Storage benches')).toBe('around');
  });

  it('returns null for unclassified phrases (gate the action off)', () => {
    expect(placementKind('Mysterious widgets')).toBeNull();
  });
});

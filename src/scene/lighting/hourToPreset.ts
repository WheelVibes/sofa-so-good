/** Phase-1 shim: maps a fractional hour to one of the existing
 *  Lighting/Sky preset keys ('day' | 'dusk' | 'night'). Phase 2
 *  replaces this with altitude-driven, astronomy-derived values. */
export type LegacyTimeKey = 'day' | 'dusk' | 'night';

export function hourToPreset(hour: number): LegacyTimeKey {
  // Wrap defensively in case a caller passes 24+.
  const h = ((hour % 24) + 24) % 24;
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'dusk';
  return 'night';
}

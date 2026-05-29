/**
 * Persists the user's graphics preferences (quality tier + per-setting
 * overrides) to localStorage so they survive reloads. Kept separate from the
 * layout save format — quality is a per-device preference, not part of a
 * saved design.
 */
import { useStore } from '../store';

const KEY = 'sofa.graphics.v1';

export function loadQualityPrefs(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const p = JSON.parse(raw) as {
      tier?: 'low' | 'medium' | 'high';
      overrides?: Record<string, unknown>;
      userSet?: boolean;
    };
    useStore.setState({
      qualityTier: p.tier ?? 'medium',
      qualityOverrides: (p.overrides as never) ?? {},
      // If they'd customised before, keep auto-adjust off so we honour it.
      qualityUserSet: !!p.userSet,
    });
  } catch {
    /* ignore corrupt prefs */
  }
}

export function watchQualityPrefs(): void {
  let last = '';
  useStore.subscribe((s) => {
    const snap = JSON.stringify({
      tier: s.qualityTier,
      overrides: s.qualityOverrides,
      userSet: s.qualityUserSet,
    });
    if (snap === last) return;
    last = snap;
    try {
      localStorage.setItem(KEY, snap);
    } catch {
      /* storage full / unavailable */
    }
  });
}

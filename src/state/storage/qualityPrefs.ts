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
      // Legacy prefs (≤ v1 tiers) used 'low' for the flat tier; migrate it.
      tier?: 'low' | 'performance' | 'medium' | 'high' | 'maximum';
      overrides?: Record<string, unknown>;
      userSet?: boolean;
      assetTier?: 'low' | 'medium' | 'high' | null;
    };
    // Migrate the old flat tier name. Other names map 1:1 onto the new
    // RenderTier union (medium/high unchanged; maximum is new).
    const tier = p.tier === 'low' ? 'performance' : p.tier ?? 'performance';
    useStore.setState({
      qualityTier: tier,
      qualityOverrides: (p.overrides as never) ?? {},
      // If they'd customised before, keep auto-adjust off so we honour it.
      qualityUserSet: !!p.userSet,
      // null = Auto (follow the render tier).
      assetTier: p.assetTier ?? null,
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
      assetTier: s.assetTier,
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

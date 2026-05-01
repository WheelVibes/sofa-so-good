import { Component, type ReactNode } from 'react';
import { Environment as DreiEnvironment } from '@react-three/drei';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { lightingFromAltitude } from './altitudeCurve';

type Preset = 'sunset' | 'dawn' | 'apartment' | 'city';

/** Filenames inside the pinned drei-assets commit. drei would resolve
 *  these itself when given `preset`, but its built-in CDN
 *  (raw.githack.com) has been intermittently returning 403, so we
 *  bypass it and request the same files from jsdelivr's GitHub mirror,
 *  which is CORS-friendly and well-funded. */
const PRESET_FILE: Record<Preset, string> = {
  apartment: 'lebombo_1k.hdr',
  city: 'potsdamer_platz_1k.hdr',
  dawn: 'kiara_1_dawn_1k.hdr',
  sunset: 'venice_sunset_1k.hdr',
};
const HDRI_BASE =
  'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/';

function altitudeToPreset(altitudeRad: number): Preset {
  const altDeg = (altitudeRad * 180) / Math.PI;
  // 'sunset' below the horizon stands in for warm-orange Bortle 8–9 skyglow
  // (Singapore). Drei's bundled `night` is a cool blue cubemap that overlit
  // dark interiors with the wrong colour; sunset+attenuated envIntensity is
  // closer to a real urban night sky leak.
  if (altDeg <= 2) return 'sunset';
  if (altDeg <= 12) return 'dawn';
  if (altDeg <= 30) return 'apartment';
  return 'city';
}

function EnvironmentInner() {
  const gi = useStore((s) => s.quality.globalIllumination);
  const sun = useSunPosition();
  if (gi === 'off') return null;
  const preset = altitudeToPreset(sun.altitude);
  const { envIntensity } = lightingFromAltitude(sun.altitude);
  return (
    <DreiEnvironment
      files={`${HDRI_BASE}${PRESET_FILE[preset]}`}
      background={false}
      environmentIntensity={envIntensity}
    />
  );
}

/** Catches HDR fetch failures (network down, CDN serving 403, etc.) and
 *  silently degrades to "no IBL" instead of crashing the whole Canvas.
 *  The renderer falls back to ambient + key + sky and stays usable. */
class EnvBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // Single warn so we know in dev when the IBL dropped out without
    // spamming if React re-tries the suspense.
    console.warn('[Environment] HDR load failed; rendering without IBL.', error);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function Environment() {
  return (
    <EnvBoundary>
      <EnvironmentInner />
    </EnvBoundary>
  );
}

import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../state/store';
import { useSunPosition } from './useSunPosition';
import { lightingFromAltitude } from './altitudeCurve';
import { LIGHT_EMITTERS } from '../../furniture/lightEmitters';
import { setFixtureGlow } from './fixtureGlow';
import { useQuality } from '../useQuality';
import type { FurnitureItem } from '../../furniture/types';

/** Below this darkness the room is daylit — render no fixture lights at all. */
const MIN_DARKNESS = 0.04;

interface ActiveLight {
  id: string;
  position: [number, number, number];
  color: string;
  baseIntensity: number;
  distance: number;
}

/**
 * Drives real point lights from light-emitting furniture (lamps, pendants).
 * Lights fade in as the sun sets, are capped to the nearest MAX_LIGHTS to the
 * camera, and cast no shadows. Daytime renders nothing (zero cost).
 */
export function FurnitureLights() {
  const items = useStore(useShallow((s) => s.items));
  const lightsMode = useStore((s) => s.lightsMode);
  const maxLights = useQuality().maxFixtureLights;
  const sun = useSunPosition();
  const { camera } = useThree();
  const levelRef = useRef(0);
  const [active, setActive] = useState<ActiveLight[]>([]);
  const lastKeyRef = useRef('');

  // Darkness: 1 at night, 0 in full day. Ramps through dusk. The effective
  // fixture level then honours the user's lights mode: forced on/off override
  // the day/night cycle so windowless rooms can be lit in daylight.
  const sunLevel = lightingFromAltitude(sun.altitude).sun;
  const darkness = Math.min(1, Math.max(0, 1 - sunLevel / 0.85));
  const level = lightsMode === 'on' ? 1 : lightsMode === 'off' ? 0 : darkness;
  levelRef.current = level;

  useFrame(() => {
    const dark = levelRef.current;
    setFixtureGlow(dark);
    if (dark < MIN_DARKNESS) {
      if (active.length > 0) {
        setActive([]);
        lastKeyRef.current = '';
      }
      return;
    }
    const emitters: { item: FurnitureItem; d2: number }[] = [];
    for (const item of items) {
      if (!(item.defId in LIGHT_EMITTERS)) continue;
      const dx = item.position[0] - camera.position.x;
      const dz = item.position[1] - camera.position.z;
      emitters.push({ item, d2: dx * dx + dz * dz });
    }
    emitters.sort((a, b) => a.d2 - b.d2);
    const chosen = emitters.slice(0, maxLights);
    const key = chosen.map((e) => e.item.id).join(',');
    if (key === lastKeyRef.current) return; // set unchanged → no re-render
    lastKeyRef.current = key;
    setActive(
      chosen.map(({ item }) => {
        const spec = LIGHT_EMITTERS[item.defId]!;
        // Per-item bulb colour (warm/neutral/cool) overrides the emitter default.
        const bulb = typeof item.props.lightColor === 'string' ? item.props.lightColor : spec.color;
        return {
          id: item.id,
          position: [item.position[0], spec.height(item.props), item.position[1]],
          color: bulb,
          baseIntensity: spec.intensity,
          distance: spec.distance,
        };
      }),
    );
  });

  if (active.length === 0) return null;
  return (
    <>
      {active.map((l) => (
        <pointLight
          key={l.id}
          position={l.position}
          color={l.color}
          intensity={l.baseIntensity * level}
          distance={l.distance}
          decay={2}
        />
      ))}
    </>
  );
}

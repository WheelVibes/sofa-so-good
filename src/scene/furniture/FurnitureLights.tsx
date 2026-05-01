import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { useStore } from '../../state/store';
import { useCatalog } from '../../furniture/catalog';
import { kelvinToRGB } from '../../furniture/lighting/colorTemp';
import type { LightEmitter } from '../../furniture/types';
import { useSunPosition } from '../lighting/useSunPosition';
import { autoFixtureLevel } from '../lighting/altitudeCurve';

const MAX_LIGHTS = 16;

interface ResolvedFixture {
  id: string;
  worldPos: [number, number, number];
  light: LightEmitter;
  intensity: number;
  color: [number, number, number];
}

function FurnitureLightsInner({ levelMul }: { levelMul: number }) {
  const items = useStore((s) => s.items);
  const catalog = useCatalog();
  const cameraX = useThree((t) => t.camera.position.x);
  const cameraY = useThree((t) => t.camera.position.y);
  const cameraZ = useThree((t) => t.camera.position.z);

  const resolved = useMemo<ResolvedFixture[]>(() => {
    const out: ResolvedFixture[] = [];
    for (const item of items) {
      const def = catalog[item.defId];
      if (!def || def.kind !== 'parametric') continue;
      if (!def.light) continue;
      const ov = item.lightOverride ?? {};
      if (ov.on === false) continue;
      const cos = Math.cos(item.rotation);
      const sin = Math.sin(item.rotation);
      const ax = def.light.anchor[0] * cos - def.light.anchor[2] * sin;
      const az = def.light.anchor[0] * sin + def.light.anchor[2] * cos;
      const worldPos: [number, number, number] = [
        item.position[0] + ax,
        def.light.anchor[1],
        item.position[1] + az,
      ];
      out.push({
        id: item.id,
        worldPos,
        light: def.light,
        intensity: ov.intensity ?? def.light.defaultIntensity,
        color: kelvinToRGB(ov.kelvin ?? def.light.defaultKelvin),
      });
    }
    out.sort((a, b) => {
      const da = (a.worldPos[0] - cameraX) ** 2 + (a.worldPos[1] - cameraY) ** 2 + (a.worldPos[2] - cameraZ) ** 2;
      const db = (b.worldPos[0] - cameraX) ** 2 + (b.worldPos[1] - cameraY) ** 2 + (b.worldPos[2] - cameraZ) ** 2;
      return da - db;
    });
    if (out.length > MAX_LIGHTS) out.length = MAX_LIGHTS;
    return out;
  }, [items, catalog, cameraX, cameraY, cameraZ]);

  return (
    <>
      {resolved.map((f) => {
        const colorHex = `rgb(${Math.round(f.color[0] * 255)},${Math.round(f.color[1] * 255)},${Math.round(f.color[2] * 255)})`;
        if (f.light.kind === 'spot') {
          const target = f.light.cone?.targetOffset ?? [0, -1, 0];
          return (
            <spotLight
              key={f.id}
              position={f.worldPos}
              intensity={f.intensity * levelMul}
              color={colorHex}
              distance={f.light.distance}
              angle={f.light.cone?.angle ?? 0.6}
              penumbra={f.light.cone?.penumbra ?? 0.3}
              decay={2}
              target-position={[
                f.worldPos[0] + target[0],
                f.worldPos[1] + target[1],
                f.worldPos[2] + target[2],
              ]}
            />
          );
        }
        return (
          <pointLight
            key={f.id}
            position={f.worldPos}
            intensity={f.intensity * levelMul}
            color={colorHex}
            distance={f.light.distance}
            decay={2}
          />
        );
      })}
    </>
  );
}

export function FurnitureLights() {
  const mode = useStore((s) => s.quality.fixtures);
  const sun = useSunPosition();
  if (mode === 'off') return null;
  const levelMul = mode === 'on' ? 1 : autoFixtureLevel(sun.altitude);
  if (levelMul <= 0) return null;
  return <FurnitureLightsInner levelMul={levelMul} />;
}

import { ROOMS } from './constants';

const FLOOR_FINISH: Record<string, string> = {
  livingDining: '#d8c9a8',
  kitchen: '#cfd6d8',
  bath1: '#c7cdd0',
  bath2: '#c7cdd0',
  serviceYard: '#bfc4c6',
  householdShelter: '#cfcfcf',
  default: '#d6c5a0',
};

export function Floor() {
  return (
    <group>
      {Object.values(ROOMS)
        .filter((r) => !r.external)
        .flatMap((r) => {
          const color = FLOOR_FINISH[r.id] ?? FLOOR_FINISH.default;
          const tiles: { cx: number; cz: number; w: number; d: number; key: string }[] = [
            { cx: r.origin[0] + r.width / 2, cz: r.origin[1] + r.depth / 2, w: r.width, d: r.depth, key: r.id },
          ];
          if (r.extension) {
            const ex = r.origin[0] + r.extension.offset[0];
            const ez = r.origin[1] + r.extension.offset[1];
            tiles.push({
              cx: ex + r.extension.width / 2,
              cz: ez + r.extension.depth / 2,
              w: r.extension.width,
              d: r.extension.depth,
              key: `${r.id}-ext`,
            });
          }
          return tiles.map((t) => (
            <mesh key={t.key} position={[t.cx, 0, t.cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[t.w, t.d]} />
              <meshStandardMaterial color={color} roughness={0.85} />
            </mesh>
          ));
        })}
    </group>
  );
}

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../state/store';
import { useCatalog } from '../furniture/catalog';
import { blockedDoorItems, doorSwingRects, frontClearanceRect } from '../layout/clearance';

/**
 * Visualises clearance issues when "Checks" is on: a translucent red marker
 * over each door-swing zone, and a red ring under any furniture blocking one.
 * Sits just above the floor.
 */
export function ClearanceOverlay() {
  const on = useStore((s) => s.clearanceOn);
  const items = useStore(useShallow((s) => s.items));
  const plan = useStore((s) => s.floorPlan);
  const catalog = useCatalog();

  const rects = useMemo(() => doorSwingRects(plan), [plan]);
  const frontRects = useMemo(
    () =>
      on
        ? items
            .map((it) => frontClearanceRect(it, catalog[it.defId]))
            .filter((r): r is NonNullable<typeof r> => !!r)
        : [],
    [on, items, catalog],
  );
  const flagged = useMemo(
    () => (on ? new Set(blockedDoorItems(items, catalog, plan)) : new Set<string>()),
    [on, items, catalog, plan],
  );

  if (!on) return null;
  return (
    <group>
      {/* Door swing zones */}
      {rects.map((r, i) => (
        <mesh key={i} position={[(r.x0 + r.x1) / 2, 0.014, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      ))}
      {/* Front-clearance keep-clear strips */}
      {frontRects.map((r, i) => (
        <mesh
          key={`front-${i}`}
          position={[(r.x0 + r.x1) / 2, 0.012, (r.z0 + r.z1) / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ))}
      {/* Red ring under blocking items */}
      {items.map((it) => {
        if (!flagged.has(it.id)) return null;
        return (
          <mesh key={it.id} position={[it.position[0], 0.02, it.position[1]]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.32, 0.46, 28]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.85} depthWrite={false} depthTest={false} />
          </mesh>
        );
      })}
    </group>
  );
}

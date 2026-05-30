import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { useCatalog } from '../furniture/catalog';
import { cameraForwardXZ, cameraPosXZ } from '../scene/cameras/cameraForward';
import { planBounds, wallLength } from '../floorplan/types';
import type { FurnitureCategory } from '../furniture/types';

const SIZE = 168;
const PAD = 0.4;

const DOT: Partial<Record<FurnitureCategory, string>> = {
  seating: '#3b82f6',
  beds: '#8b5cf6',
  tables: '#f59e0b',
  storage: '#10b981',
  appliances: '#ef4444',
  kitchen: '#ec4899',
  bathroom: '#06b6d4',
  textiles: '#f97316',
  outdoor: '#84cc16',
};

/**
 * Top-down minimap shown in walk mode for orientation: the apartment shell,
 * furniture dots (coloured by category) and a camera arrow at the player's
 * position + heading. Reads the live camera pose via cameraForward signals.
 */
export function Minimap() {
  const cameraMode = useStore((s) => s.cameraMode);
  const plan = useStore((s) => s.floorPlan);
  const items = useStore((s) => s.items);
  const catalog = useCatalog();
  const arrowRef = useRef<SVGGElement>(null);
  const [, force] = useState(0);

  const [W, D] = useMemo(() => planBounds(plan), [plan]);
  const scale = useMemo(() => (SIZE - 12) / Math.max(W + PAD * 2, D + PAD * 2), [W, D]);
  const toX = (m: number) => (m + PAD) * scale + 6;
  const toY = (m: number) => (m + PAD) * scale + 6;

  // Animate the camera arrow each frame while in walk mode.
  useEffect(() => {
    if (cameraMode !== 'firstPerson') return;
    let raf = 0;
    const tick = () => {
      const g = arrowRef.current;
      if (g) {
        const deg = (Math.atan2(cameraForwardXZ.x, -cameraForwardXZ.z) * 180) / Math.PI;
        g.setAttribute('transform', `translate(${toX(cameraPosXZ.x)} ${toY(cameraPosXZ.z)}) rotate(${deg})`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraMode, scale, W, D]);

  // Re-render dots when the layout changes (force is a no-op dependency hook).
  useEffect(() => force((n) => n + 1), [items, plan]);

  if (cameraMode !== 'firstPerson') return null;

  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-lg bg-white/85 p-1.5 shadow backdrop-blur">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Rooms */}
        {plan.rooms.map((r) => (
          <rect
            key={r.id}
            x={toX(r.origin[0])}
            y={toY(r.origin[1])}
            width={r.width * scale}
            height={r.depth * scale}
            fill="#e8eaed"
            stroke="#c4c8ce"
            strokeWidth={0.5}
          />
        ))}
        {/* Walls */}
        {plan.walls.map((w) =>
          wallLength(w) === 0 ? null : (
            <line
              key={w.id}
              x1={toX(w.start[0])}
              y1={toY(w.start[1])}
              x2={toX(w.end[0])}
              y2={toY(w.end[1])}
              stroke="#6b7280"
              strokeWidth={w.thickness === 'external' ? 2 : 1}
              strokeLinecap="round"
            />
          ),
        )}
        {/* Furniture dots */}
        {items.map((it) => {
          const def = catalog[it.defId];
          if (!def) return null;
          return <circle key={it.id} cx={toX(it.position[0])} cy={toY(it.position[1])} r={2} fill={DOT[def.category] ?? '#9ca3af'} />;
        })}
        {/* Camera arrow */}
        <g ref={arrowRef}>
          <path d="M 0 -6 L 4 5 L 0 2 L -4 5 Z" fill="#111827" stroke="#fff" strokeWidth={0.75} />
        </g>
      </svg>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { cameraForwardXZ } from '../scene/cameras/cameraForward';

// Heading is measured from world-north (which is -Z in three.js) clockwise:
// N=0, E=90, S=180, W=270. The apartment's bedroom band sits at low z (the
// "north window" rooms in src/apartment/constants.ts), so -Z = north.
function forwardToHeadingDeg(fx: number, fz: number): number {
  const deg = (Math.atan2(fx, -fz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function headingLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function Compass() {
  const [heading, setHeading] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const next = forwardToHeadingDeg(cameraForwardXZ.x, cameraForwardXZ.z);
      setHeading((prev) => (Math.abs(prev - next) < 0.25 ? prev : next));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const size = 72;
  const center = size / 2;
  const r = center - 4;
  const label = headingLabel(heading);
  const rounded = Math.round(heading);

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-1 rounded-lg bg-white/90 px-2 py-2 shadow backdrop-blur">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={r} fill="#fafafa" stroke="#d4d4d4" strokeWidth={1} />
        {/* Tick marks at every 30°, longer at cardinals. */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const major = i % 3 === 0;
          const inner = r - (major ? 6 : 3);
          const x1 = center + Math.sin(a) * inner;
          const y1 = center - Math.cos(a) * inner;
          const x2 = center + Math.sin(a) * r;
          const y2 = center - Math.cos(a) * r;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={major ? '#a3a3a3' : '#d4d4d4'}
              strokeWidth={major ? 1 : 0.75}
            />
          );
        })}
        {/* Cardinal labels: N is red so the user can find world-north at a glance. */}
        {(['N', 'E', 'S', 'W'] as const).map((d, i) => {
          const a = (i * 90 * Math.PI) / 180;
          const lr = r - 11;
          const lx = center + Math.sin(a) * lr;
          const ly = center - Math.cos(a) * lr;
          return (
            <text
              key={d}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={9}
              fontWeight={700}
              fill={d === 'N' ? '#dc2626' : '#525252'}
            >
              {d}
            </text>
          );
        })}
        {/* Needle: rotates with heading so the red tip always shows facing dir. */}
        <g transform={`rotate(${heading} ${center} ${center})`}>
          <polygon
            points={`${center},${center - r + 8} ${center - 4},${center + 2} ${center + 4},${center + 2}`}
            fill="#dc2626"
          />
          <polygon
            points={`${center},${center + r - 8} ${center - 4},${center - 2} ${center + 4},${center - 2}`}
            fill="#525252"
          />
          <circle cx={center} cy={center} r={2} fill="#262626" />
        </g>
      </svg>
      <div className="text-center text-[11px] leading-tight">
        <div className="font-semibold text-neutral-800">{label}</div>
        <div className="tabular-nums text-neutral-500">{rounded}°</div>
      </div>
    </div>
  );
}

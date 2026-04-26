import { useStore } from '../state/store';

export function Crosshair() {
  const cameraMode = useStore((s) => s.cameraMode);
  if (cameraMode !== 'firstPerson') return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="relative h-3 w-3">
        <span className="absolute left-1/2 top-0 block h-3 w-px -translate-x-1/2 bg-white/80 mix-blend-difference" />
        <span className="absolute top-1/2 left-0 block h-px w-3 -translate-y-1/2 bg-white/80 mix-blend-difference" />
      </div>
    </div>
  );
}

import { useStore } from '../../state/store';
import { RESOLUTIONS } from '../../catalog/remote/types';

export function ResolutionPicker() {
  const value = useStore((s) => s.preferredResolution);
  const set = useStore((s) => s.setPreferredResolution);
  return (
    <div className="flex gap-1 text-[10px]">
      {RESOLUTIONS.map((r) => (
        <button
          key={r}
          onClick={() => set(r)}
          className={`rounded px-1.5 py-0.5 ${
            value === r ? 'bg-blue-600 text-white' : 'bg-neutral-200 text-neutral-700'
          }`}
        >
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

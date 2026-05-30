import { useStore } from '../state/store';
import { CLEARANCE } from '../layout/designRules';

/**
 * Small heads-up readout shown while dragging a single item: its live distance
 * to the nearest wall. Turns amber below the minimum walkway clearance, so it's
 * easy to keep circulation gaps. Bottom-centre, non-interactive.
 */
export function DragHud() {
  const dragging = useStore((s) => s.draggingItemId);
  const groupSize = useStore((s) => s.dragGroupOriginals.length);
  const gap = useStore((s) => s.dragClearance);

  if (!dragging || groupSize > 1 || gap == null) return null;
  const tight = gap < CLEARANCE.walkwayMin;
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
      <div
        className={`rounded-full px-3 py-1 text-xs font-medium shadow ${tight ? 'bg-amber-500 text-white' : 'bg-neutral-900/85 text-neutral-100'}`}
      >
        ↔ Wall clearance: {gap.toFixed(2)} m{tight ? '  · tight' : ''}
      </div>
    </div>
  );
}

import { DOORS } from '../apartment/constants';
import { useStore } from '../state/store';

const LABELS: Record<string, string> = {
  'door-main': 'main door',
  'door-mainBedroom': 'main bedroom',
  'door-bedroom2': 'bedroom 2',
  'door-bedroom3': 'bedroom 3',
  'door-bath1': 'bath 1',
  'door-bath2': 'bath 2',
  'door-householdShelter': 'household shelter',
  'door-serviceYard': 'service yard',
};

export function DoorPrompt() {
  const cameraMode = useStore((s) => s.cameraMode);
  const nearbyDoorId = useStore((s) => s.nearbyDoorId);
  const isOpen = useStore((s) =>
    nearbyDoorId ? (s.doors[nearbyDoorId]?.open ?? false) : false,
  );
  const toggleDoor = useStore((s) => s.toggleDoor);

  if (cameraMode !== 'firstPerson' || !nearbyDoorId) return null;

  const spec = DOORS.find((d) => d.id === nearbyDoorId);
  if (!spec) return null;
  const label = LABELS[nearbyDoorId] ?? nearbyDoorId;
  const action = isOpen ? 'Close' : 'Open';

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
      <button
        type="button"
        onClick={() => toggleDoor(nearbyDoorId)}
        className="pointer-events-auto flex items-center gap-3 rounded-full bg-black/70 px-5 py-2 text-sm text-white shadow-lg backdrop-blur"
      >
        <kbd className="rounded border border-white/40 bg-white/10 px-2 py-0.5 font-mono text-xs">
          E
        </kbd>
        <span>
          {action} {label}
        </span>
      </button>
    </div>
  );
}

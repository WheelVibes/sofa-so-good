import { useEffect, useState } from 'react';
import { useStore, type CameraMode, type TimeOfDay } from '../state/store';
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter';
import { serialize, applySerialized } from '../state/schema';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import type { SlotMeta } from '../state/storage/StorageAdapter';

const TIMES: TimeOfDay[] = ['day', 'dusk', 'night'];

export function Toolbar() {
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const timeOfDay = useStore((s) => s.timeOfDay);
  const setTimeOfDay = useStore((s) => s.setTimeOfDay);
  const showMeasurements = useStore((s) => s.showMeasurements);
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-2 rounded-lg bg-white/90 px-3 py-2 shadow backdrop-blur">
      <SegmentedControl<CameraMode>
        label="Camera"
        value={cameraMode}
        options={[
          { value: 'orbit', label: 'Orbit' },
          { value: 'firstPerson', label: 'Walk' },
        ]}
        onChange={setCameraMode}
      />
      <Divider />
      <SegmentedControl<TimeOfDay>
        label="Time"
        value={timeOfDay}
        options={TIMES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
        onChange={setTimeOfDay}
      />
      <Divider />
      <button
        onClick={toggleMeasurements}
        className={`rounded px-3 py-1 text-sm ${showMeasurements ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
      >
        Measurements (M)
      </button>
      <Divider />
      <CatalogToggle />
      <ResetButton />
      <Divider />
      <SaveButton />
      <LoadButton />
    </div>
  );
}

function CatalogToggle() {
  const open = useStore((s) => s.catalogOpen);
  const toggle = useStore((s) => s.toggleCatalogOpen);
  return (
    <button
      onClick={toggle}
      className={`rounded px-3 py-1 text-sm ${open ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      Catalog (C)
    </button>
  );
}

function SaveButton() {
  return (
    <button
      onClick={async () => {
        const name = prompt('Save layout as…');
        if (!name) return;
        const slot = name.trim().replace(/\s+/g, '-').toLowerCase();
        if (!slot) return;
        try {
          await LocalStorageAdapter.save(slot, serialize(useStore.getState()));
        } catch (e) {
          alert('Could not save: ' + (e as Error).message);
        }
      }}
      className="rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
    >
      Save…
    </button>
  );
}

function LoadButton() {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SlotMeta[]>([]);

  useEffect(() => {
    if (!open) return;
    void LocalStorageAdapter.list().then(setSlots);
  }, [open]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Load
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg bg-white p-2 text-xs shadow">
          {slots.length === 0 ? (
            <p className="px-2 py-3 text-center text-neutral-500">No saved layouts.</p>
          ) : (
            slots
              .slice()
              .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
              .map((s) => (
                <div key={s.slot} className="flex items-center justify-between gap-2 px-2 py-1 hover:bg-neutral-100">
                  <button
                    onClick={async () => {
                      const data = await LocalStorageAdapter.load(s.slot).catch(() => null);
                      if (!data) {
                        alert('Could not load slot ' + s.slot);
                        return;
                      }
                      const userIds = useStore.getState().userFurniture.map((d) => d.id);
                      const known = new Set([...Object.keys(BUILTIN_CATALOG), ...userIds]);
                      useStore.setState(applySerialized(data, known));
                      setOpen(false);
                    }}
                    className="flex-1 truncate text-left"
                  >
                    <div className="font-medium">{s.slot}</div>
                    <div className="text-[10px] text-neutral-500">
                      {new Date(s.savedAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    onClick={async () => {
                      await LocalStorageAdapter.delete(s.slot);
                      setSlots(await LocalStorageAdapter.list());
                    }}
                    className="rounded text-rose-600 hover:bg-rose-50 hover:px-1"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ResetButton() {
  const resetToDefault = useStore((s) => s.resetToDefault);
  const resetToEmpty = useStore((s) => s.resetToEmpty);
  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        onClick={() => {
          if (confirm('Reset to floor-plan default? Your current layout will be lost.')) {
            resetToDefault();
          }
        }}
        className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200"
      >
        Default
      </button>
      <button
        onClick={() => {
          if (confirm('Clear all furniture? This cannot be undone.')) {
            resetToEmpty();
          }
        }}
        className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200"
      >
        Empty
      </button>
    </div>
  );
}

function Divider() {
  return <div className="w-px bg-neutral-200" />;
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">{label}:</span>
      <div className="flex overflow-hidden rounded border border-neutral-200">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 ${value === o.value ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

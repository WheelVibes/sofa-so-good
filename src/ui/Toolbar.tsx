import { useStore, type CameraMode, type TimeOfDay } from '../state/store';

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

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useStore, type CameraMode, PRESET_HOURS, type TimePreset } from '../state/store';
import { useEffectiveHour } from '../scene/lighting/useEffectiveHour';
import type { EditorTool } from '../state/slices/uiSlice';
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter';
import { serialize, applySerialized } from '../state/schema';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import type { SlotMeta } from '../state/storage/StorageAdapter';
import { CreditsModal } from './CreditsModal';

export function Toolbar() {
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const showMeasurements = useStore((s) => s.showMeasurements);
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);
  const showFps = useStore((s) => s.showFps);
  const toggleShowFps = useStore((s) => s.toggleShowFps);
  const [creditsOpen, setCreditsOpen] = useState(false);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-lg bg-white/90 px-3 py-2 shadow backdrop-blur">
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
      <TimeDropdown />
      <Divider />
      <OrientationControl />
      <Divider />
      <button
        onClick={toggleMeasurements}
        title="Toggle measurements (M)"
        className={`whitespace-nowrap rounded px-3 py-1 text-sm ${showMeasurements ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
      >
        Measurements
      </button>
      <button
        onClick={toggleShowFps}
        title="Toggle FPS counter"
        className={`whitespace-nowrap rounded px-3 py-1 text-sm ${showFps ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
      >
        FPS
      </button>
      {cameraMode === 'orbit' ? (
        <>
          <Divider />
          <EditorToolToggle />
          <Divider />
          <CatalogToggle />
          <Divider />
          <SaveButton />
          <LoadButton />
        </>
      ) : null}
      <Divider />
      <button
        onClick={() => setCreditsOpen(true)}
        title="Asset credits"
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Credits
      </button>
      <CreditsModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  );
}

const COMPASS_DIRS = [
  { label: 'N', deg: 0 },
  { label: 'NE', deg: 45 },
  { label: 'E', deg: 90 },
  { label: 'SE', deg: 135 },
  { label: 'S', deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W', deg: 270 },
  { label: 'NW', deg: 315 },
] as const;

function OrientationControl() {
  const [open, setOpen] = useState(false);
  const orientationDeg = useStore((s) => s.orientationDeg);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Apartment orientation"
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Sun: {Math.round(orientationDeg)}°
      </button>
      <CompassModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CompassModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const orientationDeg = useStore((s) => s.orientationDeg);
  const setOrientationDeg = useStore((s) => s.setOrientationDeg);
  const ref = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const updateFromPointer = (e: { clientX: number; clientY: number }) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    setOrientationDeg(deg);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    updateFromPointer(e);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    updateFromPointer(e);
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const size = 260;
  const r = size / 2 - 8;
  const center = size / 2;
  const sunR = r - 32;
  const rad = (orientationDeg * Math.PI) / 180;
  const sunX = center + Math.sin(rad) * sunR;
  const sunY = center - Math.cos(rad) * sunR;
  const rounded = Math.round(orientationDeg) % 360;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] overflow-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between gap-6">
          <h2 className="text-base font-semibold text-neutral-800">Sun direction</h2>
          <span className="tabular-nums text-sm text-neutral-500">{Math.round(orientationDeg)}°</span>
        </div>
        <svg
          ref={ref}
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="cursor-pointer touch-none select-none"
        >
          <circle cx={center} cy={center} r={r} fill="#fafafa" stroke="#d4d4d4" strokeWidth={1} />
          <circle cx={center} cy={center} r={r - 18} fill="none" stroke="#e5e5e5" strokeWidth={1} strokeDasharray="2 3" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i * 15 * Math.PI) / 180;
            const major = i % 6 === 0;
            const inner = r - (major ? 8 : 4);
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
          <line
            x1={center}
            y1={center}
            x2={sunX}
            y2={sunY}
            stroke="#404040"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={center} cy={center} r={3} fill="#404040" />
          <circle cx={sunX} cy={sunY} r={9} fill="#fbbf24" stroke="#92400e" strokeWidth={1.25} />
          {COMPASS_DIRS.map(({ label, deg }) => {
            const a = (deg * Math.PI) / 180;
            const lr = r - 18;
            const lx = center + Math.sin(a) * lr;
            const ly = center - Math.cos(a) * lr;
            const isCardinal = label.length === 1;
            const active = rounded === deg;
            return (
              <g
                key={label}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  draggingRef.current = false;
                  setOrientationDeg(deg);
                }}
                className="cursor-pointer"
              >
                <circle cx={lx} cy={ly} r={isCardinal ? 14 : 12} fill={active ? '#fef3c7' : 'transparent'} />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={isCardinal ? 16 : 12}
                  fill={label === 'N' ? '#dc2626' : active ? '#171717' : '#525252'}
                  fontWeight={isCardinal ? 700 : 600}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="mt-3 max-w-[260px] text-xs leading-snug text-neutral-500">
          Drag the sun or click a compass direction to set where the sun rises relative to the apartment.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function EditorToolToggle() {
  const editorTool = useStore((s) => s.editorTool);
  const setEditorTool = useStore((s) => s.setEditorTool);
  return (
    <SegmentedControl<EditorTool>
      label="Tool"
      value={editorTool}
      options={[
        { value: 'orbit', label: 'Rotate' },
        { value: 'select', label: 'Select' },
      ]}
      onChange={setEditorTool}
    />
  );
}

function CatalogToggle() {
  const open = useStore((s) => s.catalogOpen);
  const toggle = useStore((s) => s.toggleCatalogOpen);
  return (
    <button
      onClick={toggle}
      title="Toggle catalog (C)"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${open ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      Catalog
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
  const resetToDefault = useStore((s) => s.resetToDefault);
  const resetToEmpty = useStore((s) => s.resetToEmpty);

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
          <div className="mb-1 border-b border-neutral-200 pb-1">
            <button
              onClick={() => {
                if (confirm('Reset to floor-plan default? Your current layout will be lost.')) {
                  resetToDefault();
                  setOpen(false);
                }
              }}
              className="block w-full rounded px-2 py-1 text-left hover:bg-neutral-100"
            >
              Default
            </button>
            <button
              onClick={() => {
                if (confirm('Clear all furniture? This cannot be undone.')) {
                  resetToEmpty();
                  setOpen(false);
                }
              }}
              className="block w-full rounded px-2 py-1 text-left hover:bg-neutral-100"
            >
              Empty
            </button>
          </div>
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

function TimeDropdown() {
  const timeMode = useStore((s) => s.timeMode);
  const manualHour = useStore((s) => s.manualHour);
  const setTimeMode = useStore((s) => s.setTimeMode);
  const setPresetTime = useStore((s) => s.setPresetTime);
  const setManualHour = useStore((s) => s.setManualHour);
  const effectiveHour = useEffectiveHour();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const matchedPreset = matchPreset(timeMode, manualHour);
  const label = closedLabel(timeMode, manualHour, effectiveHour, matchedPreset);
  const inputValue = formatTimeInput(effectiveHour);

  const onSelectPreset = (p: TimePreset) => {
    setPresetTime(p);
    setOpen(false);
  };
  const onSelectSystem = () => {
    setTimeMode('system');
    setOpen(false);
  };
  const onCustomChange = (e: ChangeEvent<HTMLInputElement>) => {
    const [hh, mm] = e.target.value.split(':').map((n) => Number.parseInt(n, 10));
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      setManualHour(hh + mm / 60);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Time: {label}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg bg-white p-1 text-xs shadow">
          <DropdownRow
            checked={timeMode === 'system'}
            label="System"
            detail={formatClock(effectiveHour)}
            onClick={onSelectSystem}
          />
          <Separator />
          {(['morning', 'noon', 'dusk', 'night'] as const).map((p) => (
            <DropdownRow
              key={p}
              checked={timeMode === 'manual' && manualHour === PRESET_HOURS[p]}
              label={p[0].toUpperCase() + p.slice(1)}
              detail={formatClock(PRESET_HOURS[p])}
              onClick={() => onSelectPreset(p)}
            />
          ))}
          <Separator />
          <div
            className={`flex items-center gap-2 rounded px-2 py-1.5 ${
              timeMode === 'manual' && matchedPreset === null
                ? 'bg-neutral-100'
                : ''
            }`}
          >
            <span className="w-3 text-neutral-500">
              {timeMode === 'manual' && matchedPreset === null ? '●' : ''}
            </span>
            <span className="flex-1">Custom</span>
            <input
              type="time"
              value={inputValue}
              onChange={onCustomChange}
              className="rounded border border-neutral-200 bg-white px-1 py-0.5 text-xs"
            />
          </div>
          <Separator />
          <LocationFooter />
        </div>
      ) : null}
    </div>
  );
}

function LocationFooter() {
  const location = useStore((s) => s.location);
  const resetLocationPrompt = useStore((s) => s.resetLocationPrompt);

  const label = location
    ? location.label ?? `${location.lat.toFixed(2)}°, ${location.lon.toFixed(2)}°`
    : 'Default (Singapore)';

  const onClick = () => {
    // Re-show the prompt: clear the user's location and the dismissed flag.
    useStore.setState({ location: null });
    resetLocationPrompt();
  };

  return (
    <button
      onClick={onClick}
      className="block w-full rounded px-2 py-1.5 text-left text-neutral-500 hover:bg-neutral-100"
      title="Change location"
    >
      Location: <span className="text-neutral-700">{label}</span>
    </button>
  );
}

function DropdownRow({
  checked,
  label,
  detail,
  onClick,
}: {
  checked: boolean;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-neutral-100 ${
        checked ? 'bg-neutral-100' : ''
      }`}
    >
      <span className="w-3 text-neutral-500">{checked ? '●' : ''}</span>
      <span className="flex-1">{label}</span>
      <span className="text-neutral-500">{detail}</span>
    </button>
  );
}

function Separator() {
  return <div className="my-1 h-px bg-neutral-100" />;
}

function matchPreset(
  mode: 'system' | 'manual',
  hour: number,
): TimePreset | null {
  if (mode !== 'manual') return null;
  for (const p of ['morning', 'noon', 'dusk', 'night'] as const) {
    if (PRESET_HOURS[p] === hour) return p;
  }
  return null;
}

function closedLabel(
  mode: 'system' | 'manual',
  manualHour: number,
  effectiveHour: number,
  matched: TimePreset | null,
): string {
  if (mode === 'system') return `System (${formatClock(effectiveHour)})`;
  if (matched) return matched[0].toUpperCase() + matched.slice(1);
  return `Custom (${formatClock(manualHour)})`;
}

function formatClock(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const totalMinutes = Math.round(h * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  const period = hh < 12 ? 'AM' : 'PM';
  const display = hh % 12 === 0 ? 12 : hh % 12;
  return `${display}:${String(mm).padStart(2, '0')} ${period}`;
}

function formatTimeInput(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const totalMinutes = Math.round(h * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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

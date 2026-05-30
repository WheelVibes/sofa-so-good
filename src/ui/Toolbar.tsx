import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { useStore, type CameraMode, PRESET_HOURS, type TimePreset } from '../state/store';
import { useEffectiveHour } from '../scene/lighting/useEffectiveHour';
import type { EditorTool } from '../state/slices/uiSlice';
import { LocalStorageAdapter } from '../state/storage/LocalStorageAdapter';
import { serialize, applySerialized } from '../state/schema';
import { BUILTIN_CATALOG } from '../furniture/builtinCatalog';
import type { SlotMeta } from '../state/storage/StorageAdapter';
import { CreditsModal } from './CreditsModal';
import { QUALITY_LABEL } from '../scene/quality';
import { GraphicsSettings } from './GraphicsSettings';
import { STYLE_PRESETS, applyStyle } from '../materials/stylePresets';
import { LAYOUT_PRESETS } from '../furniture/layoutPresets';
import { arrangeAllRooms, arrangeAllRoomsForPlan } from '../layout/autoArrange';
import { blockedDoorItems } from '../layout/clearance';
import { isDefaultPlan } from '../floorplan/planGeometry';
import { buildReportHtml } from './report';
import { FURNITURE_SETS } from '../furniture/furnitureSets';
import { planRoomArea } from '../floorplan/types';
import { captureThumb, saveThumb, getThumb, deleteThumb } from '../state/storage/slotThumbs';
import { canRecord } from '../scene/RecordController';
import { EXPORT_EVENT } from '../scene/ScreenshotController';

export function Toolbar() {
  const cameraMode = useStore((s) => s.cameraMode);
  const setCameraMode = useStore((s) => s.setCameraMode);
  const showMeasurements = useStore((s) => s.showMeasurements);
  const toggleMeasurements = useStore((s) => s.toggleMeasurements);
  const showFps = useStore((s) => s.showFps);
  const toggleShowFps = useStore((s) => s.toggleShowFps);
  const qualityTier = useStore((s) => s.qualityTier);
  const requestTopView = useStore((s) => s.requestTopView);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [graphicsOpen, setGraphicsOpen] = useState(false);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex max-w-[96vw] flex-wrap items-center justify-center gap-2 rounded-lg bg-white/90 px-3 py-2 shadow backdrop-blur">
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
      <button
        onClick={() => setGraphicsOpen(true)}
        title="Graphics settings (auto-adjusts to hold 30+ fps)"
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Quality: {QUALITY_LABEL[qualityTier]}
      </button>
      <GraphicsSettings open={graphicsOpen} onClose={() => setGraphicsOpen(false)} />
      <LightsToggle />
      {cameraMode === 'orbit' ? (
        <>
          <Divider />
          <button
            onClick={requestTopView}
            title="Top-down plan view"
            className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
          >
            Top view
          </button>
          <TurntableToggle />
          <Divider />
          <EditorToolToggle />
          <UndoRedo />
          <SnapToggle />
          <Divider />
          <CatalogToggle />
          <SetsMenu />
          <FloorPlanButton />
          <PresetPicker />
          <TidyHomeButton />
          <StylePicker />
          <ToolsMenu />
          <Divider />
          <SaveButton />
          <LoadButton />
          <button
            onClick={() => window.dispatchEvent(new Event(EXPORT_EVENT))}
            title="Export the current view as a PNG"
            className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
          >
            Export
          </button>
          <RecordButton />
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

const LIGHTS_LABEL: Record<'auto' | 'on' | 'off', string> = {
  auto: 'Auto',
  on: 'On',
  off: 'Off',
};

/** Cycles fixture lights between Auto (day/night), On, and Off. Lets users
 *  light windowless rooms in daylight, or kill all fixtures for a daytime-only
 *  look. */
function LightsToggle() {
  const lightsMode = useStore((s) => s.lightsMode);
  const cycleLightsMode = useStore((s) => s.cycleLightsMode);
  const active = lightsMode !== 'auto';
  return (
    <button
      onClick={cycleLightsMode}
      title="Fixture lights: Auto follows the day/night cycle; On forces them on (lights windowless rooms in daylight); Off disables them"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      Lights: {LIGHTS_LABEL[lightsMode]}
    </button>
  );
}

/** Records the live view to a downloadable .webm clip (pair with Turntable
 *  for an auto-orbiting presentation video). Hidden if unsupported. */
function RecordButton() {
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);
  if (!canRecord()) return null;
  return (
    <button
      onClick={() => setRecording(!recording)}
      title={recording ? 'Stop recording and download the clip' : 'Record a video clip of the view (.webm)'}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-1 text-sm ${recording ? 'bg-red-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${recording ? 'animate-pulse bg-white' : 'bg-red-600'}`} />
      {recording ? 'Stop' : 'Record'}
    </button>
  );
}

/** One-click design styles — apply a coordinated floor + wall palette across
 *  the living spaces. */
/** Auto-arranges every room at once by the interior-design rules. */
function TidyHomeButton() {
  const tidy = () => {
    const s = useStore.getState();
    s.pushHistory();
    const next = isDefaultPlan(s.floorPlan)
      ? arrangeAllRooms(s.items, BUILTIN_CATALOG, s.doors)
      : arrangeAllRoomsForPlan(s.floorPlan, s.items, BUILTIN_CATALOG, s.doors);
    s.setItems(next);
  };
  return (
    <button
      onClick={tidy}
      title="Auto-arrange every room: flush storage, seating facing the TV, walkways + door clearances kept"
      className="whitespace-nowrap rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
    >
      ✨ Tidy home
    </button>
  );
}

/** Applies a full-flat layout preset: restyled furniture + a coordinated
 *  floor/wall palette. Distinct from StylePicker, which only repaints. */
function PresetPicker() {
  const [open, setOpen] = useState(false);
  const applyLayoutPreset = useStore((s) => s.applyLayoutPreset);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Load a complete furnished + finished interior preset"
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Presets
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-lg bg-white p-1 text-xs shadow">
          {LAYOUT_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                applyLayoutPreset(p.id);
                setOpen(false);
              }}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100"
            >
              <div className="font-medium text-neutral-800">{p.name}</div>
              <div className="text-[10px] leading-tight text-neutral-500">{p.description}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StylePicker() {
  const [open, setOpen] = useState(false);
  const setFloorFinish = useStore((s) => s.setFloorFinish);
  const setWallFinish = useStore((s) => s.setWallFinish);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Apply a coordinated floor + wall palette to the living spaces"
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Style
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg bg-white p-1 text-xs shadow">
          {STYLE_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                applyStyle(p, setFloorFinish, setWallFinish);
                setOpen(false);
              }}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100"
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Undo / redo buttons (mirror the Ctrl+Z / Ctrl+Shift+Z shortcuts). */
function UndoRedo() {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const base = 'rounded px-2 py-1 text-sm';
  return (
    <div className="flex items-stretch gap-0.5">
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className={`${base} ${canUndo ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200' : 'bg-neutral-100 text-neutral-300'}`}
      >
        ↶
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className={`${base} ${canRedo ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200' : 'bg-neutral-100 text-neutral-300'}`}
      >
        ↷
      </button>
    </div>
  );
}

/** Toggles snap-to-grid (and the floor grid overlay) plus a cell-size cycle. */
function SnapToggle() {
  const snapEnabled = useStore((s) => s.snapEnabled);
  const toggleSnap = useStore((s) => s.toggleSnap);
  const gridSize = useStore((s) => s.gridSize);
  const cycleGridSize = useStore((s) => s.cycleGridSize);
  const label = gridSize >= 1 ? `${gridSize} m` : `${Math.round(gridSize * 100)} cm`;
  return (
    <div className="flex items-stretch overflow-hidden rounded">
      <button
        onClick={toggleSnap}
        title="Snap furniture to the alignment grid and show the floor grid"
        className={`whitespace-nowrap px-3 py-1 text-sm ${snapEnabled ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
      >
        Snap
      </button>
      <button
        onClick={cycleGridSize}
        title="Grid cell size — click to cycle 10 / 25 / 50 cm / 1 m"
        className={`whitespace-nowrap border-l px-2 py-1 text-xs ${snapEnabled ? 'border-neutral-700 bg-neutral-700 text-neutral-100 hover:bg-neutral-600' : 'border-neutral-300 bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
      >
        {label}
      </button>
    </div>
  );
}

/** Toggles a slow auto-orbit for presentations / recording a turntable clip. */
function TurntableToggle() {
  const autoRotate = useStore((s) => s.autoRotate);
  const toggleAutoRotate = useStore((s) => s.toggleAutoRotate);
  return (
    <button
      onClick={toggleAutoRotate}
      title="Turntable: slowly auto-orbit the model (great for recording a clip)"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${autoRotate ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      Turntable
    </button>
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

/** Plays an automated walkthrough tour (and records it to a clip if able). */
function WalkthroughButton() {
  const touring = useStore((s) => s.touring);
  const start = () => {
    const s = useStore.getState();
    if (s.touring) {
      s.setTouring(false);
      if (s.recording) s.setRecording(false);
      return;
    }
    s.setCameraMode('orbit');
    if (canRecord()) s.setRecording(true);
    s.setTouring(true);
  };
  return (
    <button
      onClick={start}
      title="Fly a tour through every room (records a video clip if supported)"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${touring ? 'bg-rose-600 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      {touring ? '⏹ Stop tour' : '🎬 Walkthrough'}
    </button>
  );
}

/** Groups the analysis / presentation tools into one popover to keep the main
 *  bar uncluttered. Reuses the individual buttons unchanged (they keep their
 *  own active styling). Shows a dot when any tool is active. */
function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const active = useStore(
    (s) => s.budgetOpen || s.clearanceOn || s.touring || s.recording,
  );
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Design tools — budget, clearance checks, sun study, walkthrough, report"
        className={`whitespace-nowrap rounded px-3 py-1 text-sm ${open || active ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
      >
        Tools ▾
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-20 mt-1 flex w-44 flex-col gap-1 rounded-lg bg-white p-1.5 shadow"
          onClick={() => setOpen(false)}
        >
          <BudgetToggle />
          <ChecksToggle />
          <SunStudyToggle />
          <WalkthroughButton />
          <ReportButton />
        </div>
      ) : null}
    </div>
  );
}

/** Generates a printable design report (areas + budget + hero render). */
function ReportButton() {
  const open = () => {
    const s = useStore.getState();
    const canvas = document.querySelector('canvas');
    let hero: string | null = null;
    try {
      hero = canvas ? canvas.toDataURL('image/png') : null;
    } catch {
      hero = null; // tainted canvas — skip the image
    }
    const html = buildReportHtml(s.floorPlan, s.items, BUILTIN_CATALOG, hero);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };
  return (
    <button
      onClick={open}
      title="Generate a printable design report (room areas, furniture budget, render)"
      className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
    >
      Report
    </button>
  );
}

/** Toggles the live budget / shopping-list panel. */
function BudgetToggle() {
  const open = useStore((s) => s.budgetOpen);
  const toggle = useStore((s) => s.toggleBudget);
  return (
    <button
      onClick={toggle}
      title="Estimate the furniture cost (SGD) of the current layout"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${open ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      Budget
    </button>
  );
}

/** Time-lapses the sun from dawn to dusk so you can watch daylight move
 *  through the flat; restores the previous time when stopped. */
function SunStudyToggle() {
  const [active, setActive] = useState(false);
  const setTimeMode = useStore((s) => s.setTimeMode);
  const setManualHour = useStore((s) => s.setManualHour);
  useEffect(() => {
    if (!active) return;
    const prev = { mode: useStore.getState().timeMode, hour: useStore.getState().manualHour };
    setTimeMode('manual');
    let raf = 0;
    let last = performance.now();
    let hour = 6;
    const tick = (t: number) => {
      hour += ((t - last) / 1000) * 1.4; // ~1.4 sim-hours / real-second
      last = t;
      if (hour >= 20) hour = 6;
      setManualHour(hour);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setTimeMode(prev.mode);
      setManualHour(prev.hour);
    };
  }, [active, setTimeMode, setManualHour]);
  return (
    <button
      onClick={() => setActive((v) => !v)}
      title="Time-lapse the sun from dawn to dusk"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${active ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      ☀ Sun study
    </button>
  );
}

/** Toggles clearance checks (door-swing blocking) + shows the live issue count. */
function ChecksToggle() {
  const on = useStore((s) => s.clearanceOn);
  const toggle = useStore((s) => s.toggleClearance);
  const items = useStore((s) => s.items);
  const plan = useStore((s) => s.floorPlan);
  const count = useMemo(() => blockedDoorItems(items, BUILTIN_CATALOG, plan).length, [items, plan]);
  return (
    <button
      onClick={toggle}
      title="Highlight furniture that blocks a door's swing"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${on ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      Checks
      {count > 0 && (
        <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">{count}</span>
      )}
    </button>
  );
}

/** Drops a pre-arranged furniture set (group-selected, ready to drag). */
function SetsMenu() {
  const [open, setOpen] = useState(false);
  const drop = (setId: string) => {
    const set = FURNITURE_SETS.find((s) => s.id === setId);
    if (!set) return;
    const st = useStore.getState();
    // Drop at the centre of the largest room in the active plan.
    const rooms = st.floorPlan.rooms;
    const big = rooms.reduce((a, b) => (planRoomArea(b) > planRoomArea(a) ? b : a), rooms[0]);
    const base: [number, number] = big
      ? [big.origin[0] + big.width / 2, big.origin[1] + big.depth / 2]
      : [st.floorPlan.extent[0] / 2, st.floorPlan.extent[1] / 2];
    st.pushHistory();
    const stamp = Date.now().toString(36);
    const newItems = set.items.map((e, i) => ({
      id: `set-${stamp}-${i}`,
      defId: e.defId,
      position: [base[0] + e.dx, base[1] + e.dz] as [number, number],
      rotation: e.rotation,
      props: e.props ?? {},
    }));
    st.setItems([...st.items, ...newItems]);
    st.setSelectedItemIds(newItems.map((n) => n.id));
    setOpen(false);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Drop a pre-arranged furniture set (then drag it into place)"
        className="whitespace-nowrap rounded bg-neutral-100 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-200"
      >
        Sets ▾
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg bg-white p-1 text-xs shadow">
          {FURNITURE_SETS.map((s) => (
            <button
              key={s.id}
              onClick={() => drop(s.id)}
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100"
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Opens the 2D floor-plan editor (design a different apartment shell). */
function FloorPlanButton() {
  const editing = useStore((s) => s.floorPlanEditing);
  const toggle = useStore((s) => s.toggleFloorPlanEditing);
  return (
    <button
      onClick={toggle}
      title="Edit the floor plan — walls, rooms, doors, windows + room areas"
      className={`whitespace-nowrap rounded px-3 py-1 text-sm ${editing ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
    >
      Floor plan
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
          saveThumb(slot, captureThumb());
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
                    className="flex flex-1 items-center gap-2 truncate text-left"
                  >
                    {getThumb(s.slot) ? (
                      <img src={getThumb(s.slot)!} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-9 w-12 shrink-0 rounded bg-neutral-100" />
                    )}
                    <span className="min-w-0 flex-1">
                      <div className="truncate font-medium">{s.slot}</div>
                      <div className="text-[10px] text-neutral-500">
                        {new Date(s.savedAt).toLocaleString()}
                      </div>
                    </span>
                  </button>
                  <button
                    onClick={async () => {
                      await LocalStorageAdapter.delete(s.slot);
                      deleteThumb(s.slot);
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

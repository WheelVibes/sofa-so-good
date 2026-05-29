import { Fragment, useState } from 'react';
import { AC_LEDGE_AREA_M2, INTERIOR_AREA_M2, TOTAL_AREA_M2 } from '../apartment/constants';
import { useStore } from '../state/store';

type Binding = { keys: string; desc: string };

const ORBIT_CONTROLS: Binding[] = [
  { keys: 'drag', desc: 'Rotate (orbit)' },
  { keys: 'scroll', desc: 'Zoom' },
  { keys: 'click door', desc: 'Open / close' },
  { keys: 'click item', desc: 'Select furniture' },
  { keys: 'click floor', desc: 'Room finishes' },
  { keys: 'click wall', desc: 'Accent wall finish' },
  { keys: 'drag (select mode)', desc: 'Marquee select' },
  { keys: '⇧ click', desc: 'Toggle item in selection' },
  { keys: 'C', desc: 'Toggle catalog' },
  { keys: 'R / ⇧R', desc: 'Rotate (90° / 15°)' },
  { keys: 'Del', desc: 'Delete selected' },
  { keys: '⌃C / ⌃V', desc: 'Copy / paste item' },
  { keys: '⌃D', desc: 'Duplicate selected' },
  { keys: '⌃Z / ⇧⌃Z', desc: 'Undo / redo' },
  { keys: 'Esc', desc: 'Deselect' },
];

const FIRST_PERSON_CONTROLS: Binding[] = [
  { keys: 'drag', desc: 'Look around' },
  { keys: 'WASD', desc: 'Walk' },
  { keys: 'E', desc: 'Open / close nearby door' },
  { keys: 'Esc', desc: 'Exit pointer lock' },
];

const SHARED_CONTROLS: Binding[] = [
  { keys: 'V', desc: 'Toggle camera mode' },
  { keys: 'M', desc: 'Toggle measurements' },
  { keys: 'T', desc: 'Cycle time of day' },
];

const HELP_DISMISSED_KEY = 'sofa.helpHint.dismissed';

export function HelpHint() {
  // Default open, but stay collapsed across reloads once the user closes it
  // so the Controls panel doesn't re-cover the view every session.
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(HELP_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const setOpenPersist = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(HELP_DISMISSED_KEY, v ? '0' : '1');
    } catch {
      /* ignore */
    }
  };
  const showMeasurements = useStore((s) => s.showMeasurements);
  const cameraMode = useStore((s) => s.cameraMode);
  const modeControls = cameraMode === 'orbit' ? ORBIT_CONTROLS : FIRST_PERSON_CONTROLS;
  const controls = [...modeControls, ...SHARED_CONTROLS];
  if (!open) {
    return (
      <button
        onClick={() => setOpenPersist(true)}
        className="absolute bottom-3 right-3 z-10 rounded-full bg-white/90 px-3 py-2 text-sm shadow"
      >
        ?
      </button>
    );
  }
  return (
    <div className="absolute bottom-3 right-3 z-10 max-w-xs rounded-lg bg-white/95 p-4 text-xs text-neutral-700 shadow">
      {showMeasurements && (
        <div className="mb-3 border-b border-neutral-200 pb-2">
          <div className="mb-1 font-semibold">Total Area</div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
            <dt>Interior</dt>
            <dd className="font-mono">{INTERIOR_AREA_M2.toFixed(1)} m²</dd>
            <dt>AC ledge</dt>
            <dd className="font-mono">{AC_LEDGE_AREA_M2.toFixed(1)} m²</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="font-mono font-semibold">{TOTAL_AREA_M2.toFixed(1)} m²</dd>
          </dl>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Controls</span>
        <button onClick={() => setOpenPersist(false)} className="text-neutral-400 hover:text-neutral-700">
          ×
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {controls.map((c) => (
          <Fragment key={c.keys}>
            <dt className="font-mono">{c.keys}</dt>
            <dd>{c.desc}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

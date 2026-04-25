import { useState } from 'react';

export function HelpHint() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-3 right-3 z-10 rounded-full bg-white/90 px-3 py-2 text-sm shadow"
      >
        ?
      </button>
    );
  }
  return (
    <div className="absolute bottom-3 right-3 z-10 max-w-xs rounded-lg bg-white/95 p-4 text-xs text-neutral-700 shadow">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold">Controls</span>
        <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700">
          ×
        </button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-mono">drag</dt>
        <dd>Rotate (orbit) / look (walk)</dd>
        <dt className="font-mono">scroll</dt>
        <dd>Zoom (orbit only)</dd>
        <dt className="font-mono">WASD</dt>
        <dd>Walk (first-person)</dd>
        <dt className="font-mono">click door</dt>
        <dd>Open / close</dd>
        <dt className="font-mono">V</dt>
        <dd>Toggle camera mode</dd>
        <dt className="font-mono">M</dt>
        <dd>Toggle measurements</dd>
        <dt className="font-mono">Esc</dt>
        <dd>Exit pointer lock</dd>
      </dl>
    </div>
  );
}

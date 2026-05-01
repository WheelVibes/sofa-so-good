import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import { QUALITY_PRESETS, type QualityPreset } from '../state/slices/qualitySlice';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-[28rem] rounded-lg bg-white p-5 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <header className="mb-3 flex items-start justify-between">
          <h2 className="text-base font-semibold text-neutral-800">Settings</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">×</button>
        </header>

        <section className="mb-4">
          <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">Quality preset</div>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as QualityPreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setQuality(QUALITY_PRESETS[p])}
                className="flex-1 rounded border border-neutral-300 px-3 py-1 text-sm capitalize hover:bg-neutral-100"
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Shadows</label>
          <div className="flex gap-1">
            {(['off', 'low', 'high'] as const).map((v) => (
              <button
                key={v}
                aria-pressed={quality.shadows === v}
                onClick={() => setQuality({ shadows: v })}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  quality.shadows === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Sun shadows through windows. Big FPS impact.</p>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Global illumination</label>
          <div className="flex gap-1">
            {(['off', 'ibl', 'ibl+ssao'] as const).map((v) => (
              <button
                key={v}
                aria-pressed={quality.globalIllumination === v}
                onClick={() => setQuality({ globalIllumination: v })}
                className={`flex-1 rounded border px-2 py-1 text-sm ${
                  quality.globalIllumination === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">IBL is cheap; SSAO costs ~1–3 ms/frame.</p>
        </section>

        <section className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-neutral-500">Inter-room light bleed</div>
            <div className="text-[11px] text-neutral-500">Light spills through open doors. Free.</div>
          </div>
          <input
            type="checkbox"
            checked={quality.interRoomBleed}
            onChange={(e) => setQuality({ interRoomBleed: e.target.checked })}
            aria-label="Inter-room light bleed"
          />
        </section>

        <section className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase text-neutral-500">Fixtures</div>
            <div className="text-[11px] text-neutral-500">Render placed lamps and ceiling lights.</div>
          </div>
          <input
            type="checkbox"
            checked={quality.fixtures}
            onChange={(e) => setQuality({ fixtures: e.target.checked })}
            aria-label="Fixtures"
          />
        </section>
      </div>
    </div>,
    document.body,
  );
}

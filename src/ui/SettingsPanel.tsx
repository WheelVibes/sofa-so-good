import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/store';
import {
  EXPOSURE_BIAS_MAX,
  EXPOSURE_BIAS_MIN,
  QUALITY_PRESETS,
  type FixtureMode,
  type QualityPreset,
  type Weather,
} from '../state/slices/qualitySlice';
import {
  CURTAIN_OPACITY_MAX,
  CURTAIN_OPACITY_MIN,
  type WindowTintPreset,
} from '../state/slices/windowsSlice';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const quality = useStore((s) => s.quality);
  const setQuality = useStore((s) => s.setQuality);
  const timeMode = useStore((s) => s.timeMode);
  const setTimeMode = useStore((s) => s.setTimeMode);
  const timeScale = useStore((s) => s.timeScale);
  const setTimeScale = useStore((s) => s.setTimeScale);
  const windowTint = useStore((s) => s.windowTint);
  const setWindowTint = useStore((s) => s.setWindowTint);
  const curtainsClosed = useStore((s) => s.curtainsClosed);
  const setCurtainsClosed = useStore((s) => s.setCurtainsClosed);
  const curtainOpacity = useStore((s) => s.curtainOpacity);
  const setCurtainOpacity = useStore((s) => s.setCurtainOpacity);

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
        className="w-[28rem] max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 text-sm shadow-xl"
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

        <section className="mb-3">
          <label htmlFor="exposure-bias" className="mb-1 block text-xs font-semibold uppercase text-neutral-500">
            Exposure bias <span className="text-neutral-400 normal-case">({quality.exposureBias.toFixed(2)}×)</span>
          </label>
          <input
            id="exposure-bias"
            type="range"
            min={EXPOSURE_BIAS_MIN}
            max={EXPOSURE_BIAS_MAX}
            step={0.05}
            value={quality.exposureBias}
            onChange={(e) => setQuality({ exposureBias: Number(e.target.value) })}
            aria-label="Exposure bias"
            className="w-full"
          />
          <p className="mt-1 text-[11px] text-neutral-500">Layered on top of the time-of-day exposure. 1.0 = neutral.</p>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Outdoor scene</label>
          <div className="flex gap-1">
            {([['on', true], ['off', false]] as const).map(([label, val]) => (
              <button
                key={label}
                aria-pressed={quality.outdoor === val}
                onClick={() => setQuality({ outdoor: val })}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  quality.outdoor === val ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{label}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Procedural HDB skyline + ground plane outside the apartment.</p>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Weather</label>
          <div className="flex gap-1">
            {(['clear', 'hazy', 'overcast'] as Weather[]).map((v) => (
              <button
                key={v}
                aria-pressed={quality.weather === v}
                onClick={() => setQuality({ weather: v })}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  quality.weather === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Singapore default is hazy; overcast bumps milky scattering.</p>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Fixtures</label>
          <div className="flex gap-1">
            {(['auto', 'on', 'off'] as FixtureMode[]).map((v) => (
              <button
                key={v}
                aria-pressed={quality.fixtures === v}
                aria-label={v === 'auto' ? 'Fixtures auto' : v === 'on' ? 'Fixtures on' : 'Fixtures off'}
                onClick={() => setQuality({ fixtures: v })}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  quality.fixtures === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Auto ramps fixtures on around dusk (~6:45–7:15 pm in Singapore).</p>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Glass tint</label>
          <div className="flex gap-1">
            {(['none', 'warm', 'cool', 'sage', 'rose'] as WindowTintPreset[]).map((v) => (
              <button
                key={v}
                aria-pressed={windowTint === v}
                onClick={() => setWindowTint(v)}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  windowTint === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">Paints a tinted sunbeam decal on the floor through every window.</p>
        </section>

        <section className="mb-3">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Curtains</label>
          <div className="flex gap-1">
            {([['open', false], ['closed', true]] as const).map(([label, val]) => (
              <button
                key={label}
                aria-pressed={curtainsClosed === val}
                onClick={() => setCurtainsClosed(val)}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  curtainsClosed === val ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{label}</button>
            ))}
          </div>
          {curtainsClosed && (
            <div className="mt-2">
              <label htmlFor="curtain-opacity" className="mb-1 block text-[11px] text-neutral-500">
                Opacity: {curtainOpacity.toFixed(2)}
              </label>
              <input
                id="curtain-opacity"
                type="range"
                min={CURTAIN_OPACITY_MIN}
                max={CURTAIN_OPACITY_MAX}
                step={0.05}
                value={curtainOpacity}
                onChange={(e) => setCurtainOpacity(Number(e.target.value))}
                aria-label="Curtain opacity"
                className="w-full"
              />
            </div>
          )}
        </section>

        <section className="mb-1">
          <label className="mb-1 block text-xs font-semibold uppercase text-neutral-500">Clock</label>
          <div className="flex gap-1">
            {(['system', 'manual', 'accelerated'] as const).map((v) => (
              <button
                key={v}
                aria-pressed={timeMode === v}
                onClick={() => setTimeMode(v)}
                className={`flex-1 rounded border px-2 py-1 text-sm capitalize ${
                  timeMode === v ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
                }`}
              >{v}</button>
            ))}
          </div>
          {timeMode === 'accelerated' ? (
            <div className="mt-2">
              <label htmlFor="time-scale" className="mb-1 block text-[11px] text-neutral-500">
                Speed: {timeScale}× ({(86400 / timeScale).toFixed(0)} s per in-world day)
              </label>
              <input
                id="time-scale"
                type="range"
                min={60}
                max={3600}
                step={60}
                value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value))}
                aria-label="Time scale"
                className="w-full"
              />
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-neutral-500">Accelerated mode loops the day/night cycle in-world.</p>
          )}
        </section>
      </div>
    </div>,
    document.body,
  );
}

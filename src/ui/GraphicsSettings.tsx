import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../state/store';
import {
  QUALITY_LABEL,
  resolveQuality,
  type QualityTier,
} from '../scene/quality';

const TIERS: QualityTier[] = ['low', 'medium', 'high'];
const SHADOW_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1024, label: '1024' },
  { value: 2048, label: '2048' },
  { value: 4096, label: '4096' },
];

export function GraphicsSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tier = useStore((s) => s.qualityTier);
  const overrides = useStore(useShallow((s) => s.qualityOverrides));
  const userSet = useStore((s) => s.qualityUserSet);
  const setTier = useStore((s) => s.setQualityTier);
  const setOverride = useStore((s) => s.setQualityOverride);
  const resetOverrides = useStore((s) => s.resetQualityOverrides);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const eff = resolveQuality(tier, overrides);
  const hasOverrides = Object.keys(overrides).length > 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90vh] w-80 overflow-auto rounded-lg bg-white p-5 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-neutral-800">Graphics</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">×</button>
        </div>

        {/* Tier presets */}
        <div className="mb-1 text-xs font-medium text-neutral-500">Quality preset</div>
        <div className="mb-1 flex overflow-hidden rounded border border-neutral-200">
          {TIERS.map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={`flex-1 px-2 py-1.5 text-xs ${
                tier === t && !hasOverrides
                  ? 'bg-neutral-800 text-white'
                  : 'bg-white text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {QUALITY_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="mb-3 text-[11px] leading-snug text-neutral-400">
          {userSet
            ? hasOverrides
              ? 'Custom settings (overriding the preset).'
              : 'Manual — auto fps-adjust is off.'
            : 'Auto-adjusts to hold 30+ fps. Changing anything pins it.'}
        </p>

        <div className="space-y-3 border-t border-neutral-100 pt-3">
          <Row label="Sun shadows" hint="Resolution; off is fastest">
            <select
              value={eff.shadowMapSize}
              onChange={(e) => setOverride('shadowMapSize', Number(e.target.value))}
              className="rounded border border-neutral-200 px-1 py-0.5 text-xs"
            >
              {SHADOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Row>

          <Toggle label="Reflections (IBL)" hint="Image-based lighting probe" checked={eff.ibl} onChange={(v) => setOverride('ibl', v)} />
          <Toggle label="Bloom, AO + antialiasing" hint="GPU post-processing (loaded on demand)" checked={eff.postprocessing} onChange={(v) => setOverride('postprocessing', v)} />
          <Toggle label="Auto-reveal walls" hint="Fade near walls when orbiting" checked={eff.wallReveal} onChange={(v) => setOverride('wallReveal', v)} />

          <Row label="Night light fixtures" hint={`${eff.maxFixtureLights} max`}>
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={eff.maxFixtureLights}
              onChange={(e) => setOverride('maxFixtureLights', Number(e.target.value))}
              className="w-28"
            />
          </Row>
          <Row label="Resolution scale" hint={`${eff.dprMax.toFixed(2)}×`}>
            <input
              type="range"
              min={0.75}
              max={2}
              step={0.25}
              value={eff.dprMax}
              onChange={(e) => setOverride('dprMax', Number(e.target.value))}
              className="w-28"
            />
          </Row>
        </div>

        {hasOverrides && (
          <button
            onClick={resetOverrides}
            className="mt-4 w-full rounded bg-neutral-100 px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-200"
          >
            Reset to {QUALITY_LABEL[tier]} preset
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs text-neutral-700">{label}</div>
        {hint && <div className="text-[10px] text-neutral-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-neutral-800' : 'bg-neutral-300'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
    </Row>
  );
}

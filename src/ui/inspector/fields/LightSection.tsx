import { useStore } from '../../../state/store';
import type { FurnitureItem, LightEmitter } from '../../../furniture/types';

export function LightSection({ item, light }: { item: FurnitureItem; light: LightEmitter }) {
  const setOverride = useStore((s) => s.setLightOverride);
  const ov = item.lightOverride ?? {};
  const on = ov.on ?? true;
  const intensity = ov.intensity ?? light.defaultIntensity;
  const kelvin = ov.kelvin ?? light.defaultKelvin;
  const max = light.defaultIntensity * 2;
  return (
    <section className="mt-3 border-t border-neutral-200 pt-2">
      <header className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Light
      </header>
      <label className="mb-1 flex items-center justify-between">
        <span>On</span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOverride(item.id, { on: e.target.checked })}
        />
      </label>
      <label className="mb-1 block">
        <span className="mb-0.5 block">Intensity ({intensity.toFixed(1)})</span>
        <input
          type="range" min={0} max={max} step={0.5}
          value={intensity}
          onChange={(e) => setOverride(item.id, { intensity: Number(e.target.value) })}
          className="w-full"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block">Color temp ({kelvin} K)</span>
        <input
          type="range" min={2200} max={6500} step={50}
          value={kelvin}
          onChange={(e) => setOverride(item.id, { kelvin: Number(e.target.value) })}
          className="w-full"
        />
      </label>
    </section>
  );
}

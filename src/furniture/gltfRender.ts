import { isIkeaDef } from './catalog';
import type { FurnitureItem, GltfDef } from './types';

export interface GltfRender {
  url: string;
  scale: number;
  tint?: string;
  finishOverrides?: Record<string, string>;
}

/** Resolve which URL + per-component overrides a GLTF item should render with.
 *  Returns null when no URL is resolvable (e.g. unhydrated). */
export function selectGltfRender(item: FurnitureItem, def: GltfDef): GltfRender | null {
  const scale = (typeof item.props['scale'] === 'number' ? item.props['scale'] : def.scale) ?? 1;
  const tint = typeof item.props['tint'] === 'string' ? item.props['tint'] : undefined;

  if (isIkeaDef(def)) {
    const wanted = typeof item.props['variant'] === 'string' ? item.props['variant'] : def.activeVariant;
    const byWanted = def.variants.find((v) => v.finish === wanted && v.runtimeUrl);
    const active = byWanted
      ?? def.variants.find((v) => v.finish === def.activeVariant && v.runtimeUrl)
      ?? def.variants.find((v) => v.runtimeUrl);
    if (!active?.runtimeUrl) return null;
    const finishOverrides: Record<string, string> = {};
    for (const [k, val] of Object.entries(item.props)) {
      if (k.startsWith('finish:') && typeof val === 'string') finishOverrides[k.slice('finish:'.length)] = val;
    }
    return {
      url: active.runtimeUrl, scale, tint,
      finishOverrides: Object.keys(finishOverrides).length ? finishOverrides : undefined,
    };
  }

  const url = def.source === 'builtin' ? def.url : def.runtimeUrl;
  if (!url) return null;
  return { url, scale, tint, finishOverrides: 'finishOverrides' in def ? def.finishOverrides : undefined };
}

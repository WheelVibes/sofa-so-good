import type { QualityTier } from '../../scene/quality';

/** Per-tier asset budgets — single source of truth for the runtime fallback
 *  and the offline `optimize_glb_lod.mjs` script. */
export const TIER_BUDGETS: Record<
  Exclude<QualityTier, 'high'>,
  { maxTexture: number; triangleRatio: number }
> = {
  low: { maxTexture: 512, triangleRatio: 0.5 },
  medium: { maxTexture: 1024, triangleRatio: 0.75 },
};

/** Filename suffix for a tier's variant. High uses the original (no suffix). */
export function lodSuffix(tier: QualityTier): string {
  return tier === 'high' ? '' : `-${tier}`;
}

/** Rewrites a `.glb` URL to its tier variant, preserving any query string. */
export function lodUrl(url: string, tier: QualityTier): string {
  const suffix = lodSuffix(tier);
  if (!suffix) return url;
  const [path, query] = splitQuery(url);
  if (!path.endsWith('.glb')) return url;
  return `${path.slice(0, -'.glb'.length)}${suffix}.glb${query}`;
}

/** Strips a known tier suffix, returning the original base URL. */
export function baseUrl(url: string): string {
  const [path, query] = splitQuery(url);
  for (const tier of ['low', 'medium'] as const) {
    const tag = `-${tier}.glb`;
    if (path.endsWith(tag)) return `${path.slice(0, -tag.length)}.glb${query}`;
  }
  return url;
}

function splitQuery(url: string): [string, string] {
  const i = url.indexOf('?');
  return i === -1 ? [url, ''] : [url.slice(0, i), url.slice(i)];
}

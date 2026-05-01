import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

export interface FurnitureSidecar {
  id: string;
  name: string;
  category: 'beds' | 'seating' | 'tables' | 'storage' | 'kitchen' | 'lighting' | 'decor';
  footprint: { w: number; d: number; h: number };
  scale: number;
  anchor: 'floor-center' | 'origin';
  license?: 'CC0';
  attribution?: string;
  sourceUrl?: string;
}

export interface MaterialSidecar {
  id: string;
  name: string;
  category: 'floor' | 'wall';
  uvScale: [number, number];
  channels: {
    albedo: string;
    normal?: string;
    rough?: string;
    ao?: string;
  };
  license?: 'CC0';
  attribution?: string;
  sourceUrl?: string;
}

function sidecarPath(filePath: string): string {
  return `${filePath}.json`;
}

export function writeSidecar(filePath: string, data: object): void {
  writeFileSync(sidecarPath(filePath), JSON.stringify(data, null, 2));
}

export function readSidecar<T>(filePath: string): T | null {
  const p = sidecarPath(filePath);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ');
}

export interface ResolveFurnitureArgs {
  glbPath: string;
  sidecar: FurnitureSidecar | null;
  bboxFn: (path: string) => Promise<{ w: number; d: number; h: number }>;
}

export async function resolveFurnitureMetadata(
  args: ResolveFurnitureArgs,
): Promise<FurnitureSidecar> {
  if (args.sidecar) return args.sidecar;
  const filename = basename(args.glbPath).replace(/\.glb$/i, '');
  const id = `dropped-${filename}`;
  const bbox = await args.bboxFn(args.glbPath);
  return {
    id,
    name: titleCase(filename),
    category: 'decor',
    footprint: bbox,
    scale: 1.0,
    anchor: 'floor-center',
  };
}

/** Channel-suffix → channel-key mapping. Picked to cover Poly Haven
 *  (`_diff`, `_nor_gl`, `_rough`, `_ao`), ambientCG (`_Color`, `_NormalGL`,
 *  `_Roughness`, `_AmbientOcclusion`), and the bare-word variants people
 *  use when hand-naming files. Order matters within each list — the
 *  first match wins, so longer suffixes go before substrings of them. */
const CHANNEL_PATTERNS: Record<'albedo' | 'normal' | 'rough' | 'ao', RegExp[]> = {
  albedo: [/_basecolor$/i, /_albedo$/i, /_diffuse$/i, /_color$/i, /_diff$/i, /_col$/i],
  normal: [/_normalgl$/i, /_normaldx$/i, /_nor_gl$/i, /_nor_dx$/i, /_normal$/i, /_norm$/i, /_nrm$/i, /_nor$/i],
  rough: [/_roughness$/i, /_rough$/i, /_rgh$/i],
  ao: [/_ambientocclusion$/i, /_occlusion$/i, /_ao$/i],
};

const TEXTURE_EXT = /\.(jpe?g|png|webp)$/i;

/** Strips suffix + extension; e.g. `oak_floor_2k_diff.jpg` → `oak_floor_2k`. */
function baseSlug(filename: string): string {
  const noExt = filename.replace(TEXTURE_EXT, '');
  for (const patterns of Object.values(CHANNEL_PATTERNS)) {
    for (const re of patterns) {
      if (re.test(noExt)) return noExt.replace(re, '');
    }
  }
  return noExt;
}

interface DetectMaterialArgs {
  /** Folder containing texture maps (no `material.json` sidecar). */
  dir: string;
  /** Filenames inside `dir`. Defaulted from `dir` when omitted; injected by
   *  tests that don't want to touch the filesystem. */
  files?: string[];
  /** Used as `id` and basis for `name`. Defaulted to the folder's basename. */
  slugHint?: string;
}

/** Heuristically synthesize a `MaterialSidecar` from the texture filenames in
 *  a drop folder. Returns null if no albedo-like file is found, since a
 *  material without a base color is not renderable.
 *
 *  Categorization: any filename containing `wall|brick|plaster|paint|tile|
 *  wallpaper` → `wall`; otherwise `floor`. Mirrors the runtime providers'
 *  classifier so dropped materials tag the same way as remote ones. */
export function detectMaterialFromFolder(args: DetectMaterialArgs): MaterialSidecar | null {
  const files = args.files ?? readdirSync(args.dir).filter((n) => TEXTURE_EXT.test(n));
  if (files.length === 0) return null;
  const channels: MaterialSidecar['channels'] = { albedo: '' };
  // First pass: classify each file by suffix.
  for (const f of files) {
    const noExt = f.replace(TEXTURE_EXT, '');
    for (const [key, patterns] of Object.entries(CHANNEL_PATTERNS) as [
      keyof typeof CHANNEL_PATTERNS,
      RegExp[],
    ][]) {
      if (patterns.some((re) => re.test(noExt))) {
        // Don't overwrite an already-found channel; first match wins so the
        // detection is stable when a folder contains both `_diff` and a
        // duplicate-purpose `_color` file.
        if (!channels[key]) channels[key] = f;
        break;
      }
    }
  }
  // Fallback: if nothing matched the albedo suffixes but exactly one
  // texture exists, treat it as the albedo so single-texture drops work.
  if (!channels.albedo && files.length === 1) channels.albedo = files[0];
  if (!channels.albedo) return null;

  const slug = args.slugHint ?? basename(args.dir);
  const reference = baseSlug(channels.albedo) || slug;
  const isWall = /wall|brick|plaster|paint|tile|wallpaper/i.test(reference);
  return {
    id: `dropped-${slug}`,
    name: titleCase(slug),
    category: isWall ? 'wall' : 'floor',
    uvScale: [1, 1],
    channels,
  };
}

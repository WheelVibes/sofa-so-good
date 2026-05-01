import type {
  AssetBundle,
  RemoteEntry,
  RemoteProvider,
  Resolution,
} from '../types';
import { mapPolyHavenFurnitureCategory } from '../category-map';
import type { MaterialCategory } from '../../../materials/types';

const API = 'https://api.polyhaven.com';
const CDN_THUMB = (slug: string) =>
  `https://cdn.polyhaven.com/asset_img/thumbs/${slug}.png?height=150`;
const PAGE_URL = (slug: string) => `https://polyhaven.com/a/${slug}`;

interface PHAssetMeta {
  name: string;
  categories?: string[];
  authors?: Record<string, string>;
  tags?: string[];
}

const tagsFor = (m: PHAssetMeta): string[] => [
  ...(m.tags ?? []),
  ...(m.categories ?? []),
];
type PHIndex = Record<string, PHAssetMeta>;

interface PHFiles {
  gltf?: Record<string, Record<string, { url: string; md5?: string; size?: number }>>;
}

const attrib = (a: PHAssetMeta) =>
  `Poly Haven — ${Object.keys(a.authors ?? { Unknown: '' }).join(', ')}`;

function materialCategoryFor(meta: PHAssetMeta): MaterialCategory {
  const cats = meta.categories ?? [];
  return cats.some((c) => /wall|brick|plaster|paint/i.test(c)) ? 'wall' : 'floor';
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Poly Haven ${res.status}: ${url}`);
  return (await res.json()) as T;
}

async function fetchIndex(signal?: AbortSignal): Promise<RemoteEntry[]> {
  const [models, textures] = await Promise.all([
    fetchJson<PHIndex>(`${API}/assets?t=models`, signal),
    fetchJson<PHIndex>(`${API}/assets?t=textures`, signal),
  ]);
  const out: RemoteEntry[] = [];
  for (const [slug, meta] of Object.entries(models)) {
    out.push({
      provider: 'polyhaven',
      slug,
      kind: 'furniture',
      name: meta.name,
      category: mapPolyHavenFurnitureCategory(meta.categories ?? []),
      thumbUrl: CDN_THUMB(slug),
      resolutions: ['1k', '2k', '4k'],
      attribution: attrib(meta),
      sourceUrl: PAGE_URL(slug),
      tags: tagsFor(meta),
    });
  }
  for (const [slug, meta] of Object.entries(textures)) {
    out.push({
      provider: 'polyhaven',
      slug,
      kind: 'material',
      name: meta.name,
      category: materialCategoryFor(meta),
      thumbUrl: CDN_THUMB(slug),
      resolutions: ['1k', '2k', '4k'],
      attribution: attrib(meta),
      sourceUrl: PAGE_URL(slug),
      tags: tagsFor(meta),
    });
  }
  return out;
}

async function fetchThumbnail(entry: RemoteEntry, signal?: AbortSignal): Promise<Blob> {
  const r = await fetch(entry.thumbUrl, { signal });
  if (!r.ok) throw new Error(`Thumb ${r.status}`);
  return r.blob();
}

async function fetchAsset(
  entry: RemoteEntry,
  resolution: Resolution,
  signal?: AbortSignal,
): Promise<AssetBundle> {
  const files = await fetchJson<PHFiles>(`${API}/files/${entry.slug}`, signal);
  if (entry.kind === 'material') {
    const channels: Record<string, Blob> = {};
    const want: Record<string, RegExp> = {
      albedo: /diff|color|albedo/i,
      normal: /nor_gl|normal/i,
      roughness: /rough/i,
      ao: /ao|ambient/i,
    };
    const variants = files.gltf?.[resolution] ?? {};
    for (const [path, file] of Object.entries(variants)) {
      for (const [ch, re] of Object.entries(want)) {
        if (re.test(path) && !channels[ch]) {
          const r = await fetch(file.url, { signal });
          if (!r.ok) throw new Error(`Texture ${r.status}`);
          channels[ch] = await r.blob();
        }
      }
    }
    if (!channels.albedo) throw new Error(`No albedo texture for ${entry.slug}`);
    return { kind: 'material', channels };
  }
  // furniture
  const variants = files.gltf?.[resolution] ?? {};
  let gltfPath = '';
  let bin: Blob | undefined;
  let gltfJson: object | undefined;
  const textures: Record<string, Blob> = {};
  for (const [path, file] of Object.entries(variants)) {
    const r = await fetch(file.url, { signal });
    if (!r.ok) throw new Error(`File ${r.status}: ${path}`);
    if (path.endsWith('.gltf')) {
      gltfPath = path;
      gltfJson = (await r.json()) as object;
    } else if (path.endsWith('.bin')) {
      bin = await r.blob();
    } else {
      textures[path] = await r.blob();
    }
  }
  if (!gltfJson) throw new Error(`No .gltf in variants for ${entry.slug}`);
  return { kind: 'furniture', gltfJson, bin, textures, rootPath: gltfPath };
}

export const polyhaven: RemoteProvider = {
  id: 'polyhaven',
  fetchIndex,
  fetchThumbnail,
  fetchAsset,
};

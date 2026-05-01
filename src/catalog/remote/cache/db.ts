import { createStore, get, set, del, clear, keys } from 'idb-keyval';
import type { AssetBundle, RemoteEntry, ProviderId } from '../types';

// idb-keyval's createStore creates a one-store database per call, so each
// logical store gets its own backing DB.
const SCHEMA_VERSION = 1;
const META_KEY = '__meta__';

export const indexStore = createStore('sofa-cache-index', 'kv');
export const thumbsStore = createStore('sofa-cache-thumbs', 'kv');
export const assetsStore = createStore('sofa-cache-assets', 'kv');
export const metaStore = createStore('sofa-cache-meta', 'kv');

// Some non-browser test environments (happy-dom + fake-indexeddb) lose the
// Blob prototype across structuredClone. We serialize Blobs to a portable
// shape on write and rebuild them on read so behaviour is identical in test
// and production.
interface SerializedBlob {
  __blob__: true;
  type: string;
  bytes: ArrayBuffer;
}

const isSerializedBlob = (v: unknown): v is SerializedBlob =>
  !!v && typeof v === 'object' && (v as { __blob__?: boolean }).__blob__ === true;

async function serializeBlob(b: Blob): Promise<SerializedBlob> {
  return { __blob__: true, type: b.type, bytes: await b.arrayBuffer() };
}

function deserializeBlob(v: unknown): Blob {
  if (v instanceof Blob) return v;
  if (isSerializedBlob(v)) return new Blob([v.bytes], { type: v.type });
  throw new Error('value is not a Blob');
}

async function serializeBundle(b: AssetBundle): Promise<unknown> {
  if (b.kind === 'material') {
    const channels: Record<string, SerializedBlob> = {};
    for (const [k, v] of Object.entries(b.channels)) channels[k] = await serializeBlob(v);
    return { kind: 'material', channels };
  }
  const textures: Record<string, SerializedBlob> = {};
  for (const [k, v] of Object.entries(b.textures)) textures[k] = await serializeBlob(v);
  return {
    kind: 'furniture',
    gltfJson: b.gltfJson,
    bin: b.bin ? await serializeBlob(b.bin) : undefined,
    textures,
    rootPath: b.rootPath,
  };
}

function deserializeBundle(v: unknown): AssetBundle {
  const obj = v as { kind: 'material' | 'furniture' } & Record<string, unknown>;
  if (obj.kind === 'material') {
    const out: Record<string, Blob> = {};
    for (const [k, c] of Object.entries(obj.channels as Record<string, unknown>)) {
      out[k] = deserializeBlob(c);
    }
    return { kind: 'material', channels: out };
  }
  const textures: Record<string, Blob> = {};
  for (const [k, t] of Object.entries(obj.textures as Record<string, unknown>)) {
    textures[k] = deserializeBlob(t);
  }
  return {
    kind: 'furniture',
    gltfJson: obj.gltfJson as object,
    bin: obj.bin ? deserializeBlob(obj.bin) : undefined,
    textures,
    rootPath: obj.rootPath as string,
  };
}

export interface CacheMetaEntry {
  key: string;
  bytes: number;
  lastAccessedAt: number;
}
export interface CacheMeta {
  schemaVersion: number;
  totalBytes: number;
  entries: CacheMetaEntry[];
}

function freshEmptyMeta(): CacheMeta {
  return { schemaVersion: SCHEMA_VERSION, totalBytes: 0, entries: [] };
}

export async function getMeta(): Promise<CacheMeta> {
  const m = (await get(META_KEY, metaStore)) as CacheMeta | undefined;
  if (!m) return freshEmptyMeta();
  if (m.schemaVersion !== SCHEMA_VERSION) {
    await resetCacheForTest();
    return freshEmptyMeta();
  }
  return { schemaVersion: m.schemaVersion, totalBytes: m.totalBytes, entries: [...m.entries] };
}

async function setMeta(m: CacheMeta): Promise<void> {
  await set(META_KEY, m, metaStore);
}

function bundleBytes(b: AssetBundle): number {
  if (b.kind === 'material') {
    return Object.values(b.channels).reduce((a, c) => a + c.size, 0);
  }
  let n = b.bin?.size ?? 0;
  for (const t of Object.values(b.textures)) n += t.size;
  n += JSON.stringify(b.gltfJson).length;
  return n;
}

export async function putAsset(key: string, bundle: AssetBundle): Promise<void> {
  await set(key, await serializeBundle(bundle), assetsStore);
  const meta = await getMeta();
  const bytes = bundleBytes(bundle);
  const idx = meta.entries.findIndex((e) => e.key === key);
  if (idx >= 0) meta.totalBytes -= meta.entries[idx].bytes;
  meta.totalBytes += bytes;
  const entry = { key, bytes, lastAccessedAt: Date.now() };
  if (idx >= 0) meta.entries[idx] = entry;
  else meta.entries.push(entry);
  await setMeta(meta);
}

export async function getAsset(key: string): Promise<AssetBundle | undefined> {
  const raw = await get(key, assetsStore);
  if (!raw) return undefined;
  const meta = await getMeta();
  const e = meta.entries.find((x) => x.key === key);
  if (e) {
    e.lastAccessedAt = Date.now();
    await setMeta(meta);
  }
  return deserializeBundle(raw);
}

export async function deleteAsset(key: string): Promise<void> {
  const meta = await getMeta();
  const idx = meta.entries.findIndex((e) => e.key === key);
  if (idx >= 0) {
    meta.totalBytes -= meta.entries[idx].bytes;
    meta.entries.splice(idx, 1);
    await setMeta(meta);
  }
  await del(key, assetsStore);
}

export async function listAssetKeys(): Promise<string[]> {
  return (await keys(assetsStore)) as string[];
}

export async function putThumb(key: string, b: Blob): Promise<void> {
  await set(key, await serializeBlob(b), thumbsStore);
}
export async function getThumb(key: string): Promise<Blob | undefined> {
  const raw = await get(key, thumbsStore);
  if (!raw) return undefined;
  return deserializeBlob(raw);
}

export interface IndexRecord {
  entries: RemoteEntry[];
  fetchedAt: string;
}
export async function putIndex(p: ProviderId, entries: RemoteEntry[]): Promise<void> {
  const rec: IndexRecord = { entries, fetchedAt: new Date().toISOString() };
  await set(p, rec, indexStore);
}
export async function getIndex(p: ProviderId): Promise<IndexRecord | undefined> {
  return (await get(p, indexStore)) as IndexRecord | undefined;
}

export async function resetCacheForTest(): Promise<void> {
  await clear(indexStore);
  await clear(thumbsStore);
  await clear(assetsStore);
  await clear(metaStore);
}

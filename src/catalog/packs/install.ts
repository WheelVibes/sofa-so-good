import { unzipSync } from 'fflate';
import type { Pack, InstalledPack, InstalledPackEntry } from './types';
import { ThumbnailRenderer } from './thumbnail';
import { glbFootprint } from './footprint';
import { IdbAssetStore } from '../../state/storage/IdbAssetStore';
import { InstalledPackStore } from './installedPackStore';
import { useStore } from '../../state/store';

export interface InstallOpts {
  signal?: AbortSignal;
  /** Injection seam for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Notification id to drive (when called from UI). When omitted the
   *  flow opens its own notification. */
  notificationId?: string;
}

const glbKey = (packId: string, entryId: string) => `pack:${packId}:${entryId}:glb`;
const thumbKey = (packId: string, entryId: string) => `pack:${packId}:${entryId}:thumb`;

export async function installPack(pack: Pack, opts: InstallOpts = {}): Promise<InstalledPack> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { notify } = useStore.getState();
  const notifId =
    opts.notificationId ??
    notify.start({ title: `Installing ${pack.name}`, kind: 'progress', message: 'Downloading…' });

  try {
    const res = await fetchImpl(pack.downloadUrl, { signal: opts.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('Content-Length') ?? pack.sizeBytes);
    if (Math.abs(total - pack.sizeBytes) / pack.sizeBytes > 0.05) {
      throw new Error(
        `Pack size mismatch — server says ${total}B, registry says ${pack.sizeBytes}B (>5% drift). The pack URL may have moved; please report.`,
      );
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      if (opts.signal?.aborted) throw new Error('Cancelled');
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      notify.update(notifId, {
        progress: 0.5 * (received / total),
        message: `Downloading… ${Math.round((received / total) * 100)}%`,
      });
    }
    const zipBytes = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      zipBytes.set(c, offset);
      offset += c.byteLength;
    }

    notify.update(notifId, { progress: 0.55, message: 'Unzipping…' });
    const files = unzipSync(zipBytes);
    notify.update(notifId, { progress: 0.6, message: 'Processing entries…' });

    const descriptors = pack.parseEntries(files);
    const renderer = new ThumbnailRenderer();
    const entries: InstalledPackEntry[] = [];
    try {
      for (let i = 0; i < descriptors.length; i++) {
        if (opts.signal?.aborted) throw new Error('Cancelled');
        const d = descriptors[i];
        const glbBytes = files[d.glbPath];
        if (!glbBytes) continue;

        const [thumbBlob, footprint] = await Promise.all([
          renderer.render(glbBytes),
          glbFootprint(glbBytes),
        ]);

        const gKey = glbKey(pack.id, d.id);
        const tKey = thumbKey(pack.id, d.id);
        const now = new Date().toISOString();

        await IdbAssetStore.put({
          assetId: gKey,
          kind: 'gltf',
          mime: 'model/gltf-binary',
          name: d.name,
          uploadedAt: now,
          blob: new Blob([new Uint8Array(glbBytes)], { type: 'model/gltf-binary' }),
          meta: { source: 'pack', packId: pack.id, entryId: d.id, role: 'glb' },
        });
        await IdbAssetStore.put({
          assetId: tKey,
          kind: 'texture',
          mime: thumbBlob.type || 'image/jpeg',
          name: `${d.name} (thumb)`,
          uploadedAt: now,
          blob: thumbBlob,
          meta: { source: 'pack', packId: pack.id, entryId: d.id, role: 'thumb' },
        });

        entries.push({
          id: `${pack.id}:${d.id}`,
          packId: pack.id,
          entryId: d.id,
          name: d.name,
          category: d.category,
          footprint,
          glbKey: gKey,
          thumbKey: tKey,
        });

        notify.update(notifId, {
          progress: 0.6 + 0.4 * ((i + 1) / descriptors.length),
          message: `Processing entries… ${i + 1}/${descriptors.length}`,
        });
      }
    } finally {
      renderer.dispose();
    }

    const installed: InstalledPack = {
      packId: pack.id,
      installedAt: new Date().toISOString(),
      entries,
    };
    await InstalledPackStore.put(installed);

    useStore.getState().markPackInstalled(installed);

    notify.success(notifId, `${entries.length} items added to your catalog`);
    return installed;
  } catch (err) {
    notify.error(notifId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

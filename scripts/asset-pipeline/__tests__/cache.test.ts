import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { cachePathFor, downloadToCache } from '../cache';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'asset-cache-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('cachePathFor', () => {
  it('produces a stable path from a URL', () => {
    const a = cachePathFor(tmp, 'https://example.com/foo.glb');
    const b = cachePathFor(tmp, 'https://example.com/foo.glb');
    expect(a).toBe(b);
    expect(a.startsWith(tmp)).toBe(true);
    expect(a.endsWith('foo.glb')).toBe(true);
  });

  it('produces different paths for different URLs', () => {
    expect(cachePathFor(tmp, 'https://a.com/x.glb')).not.toBe(
      cachePathFor(tmp, 'https://b.com/x.glb'),
    );
  });
});

describe('downloadToCache', () => {
  it('skips download when the cache file already exists', async () => {
    const url = 'https://example.com/cached.glb';
    const path = cachePathFor(tmp, url);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'cached-bytes');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await downloadToCache(tmp, url);
    expect(result).toBe(path);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readFileSync(path, 'utf8')).toBe('cached-bytes');
  });

  it('downloads when the cache is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('downloaded').buffer,
    })));
    const url = 'https://example.com/new.glb';
    const path = await downloadToCache(tmp, url);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('downloaded');
  });

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(downloadToCache(tmp, 'https://example.com/missing.glb'))
      .rejects.toThrow(/404/);
  });
});

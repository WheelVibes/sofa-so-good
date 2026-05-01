import { afterEach, describe, expect, it, vi } from 'vitest';
import { ambientcg } from './ambientcg';
import { zipSync } from 'fflate';

afterEach(() => vi.unstubAllGlobals());

describe('ambientcg', () => {
  it('parses index entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              foundAssets: [
                {
                  assetId: 'Wood001',
                  displayName: 'Wood 001',
                  category: 'Wood',
                  previewImage: { '128-PNG': 'https://acg.example/wood001-128.png' },
                  downloadFolders: [
                    {
                      downloadFiletypeCategories: {
                        zip: {
                          downloads: [
                            {
                              attribute: '2K-JPG',
                              downloadLink: 'https://acg.example/wood001-2k.zip',
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );

    const entries = await ambientcg.fetchIndex();
    expect(entries[0].slug).toBe('Wood001');
    expect(entries[0].kind).toBe('material');
  });

  it('extracts material channels from a zip', async () => {
    const zip = zipSync({
      'Wood001_2K_Color.jpg': new Uint8Array([1, 2, 3]),
      'Wood001_2K_NormalGL.jpg': new Uint8Array([4, 5]),
      'Wood001_2K_Roughness.jpg': new Uint8Array([6]),
      'Wood001_2K_AmbientOcclusion.jpg': new Uint8Array([7]),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('full_json')) {
          return new Response(
            JSON.stringify({
              foundAssets: [
                {
                  assetId: 'Wood001',
                  displayName: 'Wood 001',
                  category: 'Wood',
                  previewImage: { '128-PNG': 'https://x/p.png' },
                  downloadFolders: [
                    {
                      downloadFiletypeCategories: {
                        zip: {
                          downloads: [
                            {
                              attribute: '2K-JPG',
                              downloadLink: 'https://acg.example/w.zip',
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          );
        }
        const ab = new Uint8Array(zip).buffer as ArrayBuffer;
        return new Response(ab, { status: 200 });
      }),
    );

    const [entry] = await ambientcg.fetchIndex();
    const bundle = await ambientcg.fetchAsset(entry, '2k');
    if (bundle.kind !== 'material') throw new Error('expected material');
    expect(bundle.channels.albedo).toBeInstanceOf(Blob);
    expect(bundle.channels.normal).toBeInstanceOf(Blob);
    expect(bundle.channels.roughness).toBeInstanceOf(Blob);
    expect(bundle.channels.ao).toBeInstanceOf(Blob);
  });
});

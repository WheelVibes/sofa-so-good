import { describe, it, expect } from 'vitest';
import { validateGlbFile, MAX_GLB_BYTES } from './validate';

function makeFile(name: string, bytes: Uint8Array | string, mime: string = 'application/octet-stream'): File {
  // Cast keeps TS quiet about Uint8Array<ArrayBufferLike>; the
  // runtime value is a valid BlobPart in every browser/test env.
  return new File([bytes as unknown as BlobPart], name, { type: mime });
}

function makeGlbHeader(): Uint8Array {
  // 'glTF' magic (0x46546c67 LE) + version 2 + length placeholder
  const buf = new Uint8Array(12);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 12, true);
  return buf;
}

describe('validateGlbFile', () => {
  it('accepts a .glb with the correct magic header', async () => {
    const file = makeFile('chair.glb', makeGlbHeader());
    const r = await validateGlbFile(file);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('model/gltf-binary');
  });

  it('rejects a .glb without the magic header', async () => {
    const file = makeFile('not-a-glb.glb', new Uint8Array(64));
    const r = await validateGlbFile(file);
    expect(r.ok).toBe(false);
  });

  it('rejects unsupported extensions', async () => {
    const r = await validateGlbFile(makeFile('foo.png', new Uint8Array(8)));
    expect(r.ok).toBe(false);
  });

  it('rejects oversize files', async () => {
    const big = new Uint8Array(MAX_GLB_BYTES + 1);
    big.set(makeGlbHeader());
    const r = await validateGlbFile(makeFile('big.glb', big));
    expect(r.ok).toBe(false);
  });

  it('accepts a self-contained GLTF JSON', async () => {
    const json = JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ uri: 'data:application/octet-stream;base64,', byteLength: 0 }],
    });
    const r = await validateGlbFile(makeFile('cube.gltf', json));
    expect(r.ok).toBe(true);
  });

  it('rejects a GLTF that references external URIs', async () => {
    const json = JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ uri: 'remote.bin', byteLength: 0 }],
    });
    const r = await validateGlbFile(makeFile('cube.gltf', json));
    expect(r.ok).toBe(false);
  });
});

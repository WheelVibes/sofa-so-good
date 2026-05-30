import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the calls drei's useGLTF receives. In drei 9.122 the only genuine
// boot-time global registration hook on `useGLTF` is `setDecoderPath` (Draco).
// Meshopt is auto-wired per useGLTF() call (default on); KTX2 is handled by a
// separate renderer-bound `useKTX2` hook — neither has a global setter we can
// call at boot. The test therefore asserts the real, available mechanism.
const setDecoderPath = vi.fn();

vi.mock('@react-three/drei', () => ({
  useGLTF: Object.assign(
    // useGLTF is callable; we never call it here, just read its statics.
    vi.fn(),
    { setDecoderPath },
  ),
}));

// MeshoptDecoder from three-stdlib is a function in this version. We don't
// rely on calling it (drei does that per-load), but keep the import resolvable.
vi.mock('three-stdlib', () => ({
  MeshoptDecoder: vi.fn(() => ({ supported: true })),
}));

async function freshModule() {
  vi.resetModules();
  return import('./decoders');
}

describe('registerGltfDecoders', () => {
  beforeEach(() => {
    setDecoderPath.mockClear();
  });

  it('wires the Draco decoder path on the shared useGLTF loader', async () => {
    const { registerGltfDecoders } = await freshModule();
    const report = registerGltfDecoders();

    // Draco: the one real global registration hook drei 9.122 exposes.
    expect(setDecoderPath).toHaveBeenCalledTimes(1);
    expect(setDecoderPath).toHaveBeenCalledWith(expect.stringContaining('draco'));
    expect(report.draco).toBe(true);
  });

  it('reports meshopt and ktx2 support (auto-wired, no global setter)', async () => {
    const { registerGltfDecoders } = await freshModule();
    const report = registerGltfDecoders();

    // Meshopt is auto-applied by drei on every useGLTF call; KTX2 is wired
    // lazily by the renderer-bound useKTX2 hook. Both are reported true to
    // signal compressed GLBs will decode, even without a boot-time setter.
    expect(report.meshopt).toBe(true);
    expect(report.ktx2).toBe(true);
  });

  it('is idempotent: a second call does not re-invoke the setters', async () => {
    const { registerGltfDecoders } = await freshModule();

    const first = registerGltfDecoders();
    expect(first.alreadyRegistered).toBeFalsy();
    expect(setDecoderPath).toHaveBeenCalledTimes(1);

    const second = registerGltfDecoders();
    expect(second.alreadyRegistered).toBe(true);
    // Still only the single call from the first registration.
    expect(setDecoderPath).toHaveBeenCalledTimes(1);
  });
});

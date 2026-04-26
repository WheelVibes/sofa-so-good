import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { processTexture } from '../process-texture';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'tex-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

async function makePng(path: string, size = 8): Promise<void> {
  const buf = await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
  writeFileSync(path, buf);
}

describe('processTexture', () => {
  it('writes a non-empty output when source is small', async () => {
    const src = join(tmp, 'src.png');
    const dst = join(tmp, 'out.png');
    await makePng(src);
    await processTexture(src, dst, { maxSize: 2048 });
    expect(existsSync(dst)).toBe(true);
    expect(statSync(dst).size).toBeGreaterThan(0);
  });

  it('clamps dimensions to maxSize when source is larger', async () => {
    const src = join(tmp, 'src.png');
    const dst = join(tmp, 'out.png');
    await makePng(src, 256);
    await processTexture(src, dst, { maxSize: 64 });
    const meta = await sharp(dst).metadata();
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
  });

  it('preserves jpg format for jpg sources', async () => {
    const src = join(tmp, 'src.jpg');
    const buf = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg()
      .toBuffer();
    writeFileSync(src, buf);
    const dst = join(tmp, 'out.jpg');
    await processTexture(src, dst, { maxSize: 2048 });
    const meta = await sharp(dst).metadata();
    expect(meta.format).toBe('jpeg');
  });
});

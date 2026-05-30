import { NodeIO } from '@gltf-transform/core';
// ALL_EXTENSIONS (not just KHRONOS) so EXT_texture_webp source GLBs read/write
// — ~35% of the IKEA models ship WebP textures and crash on KHRONOS-only IO.
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, prune, weld, simplify, textureCompress, draco,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  'ikea_sg_3d_models',
);
const TIERS = {
  low: { maxTexture: 512, triangleRatio: 0.5 },
  medium: { maxTexture: 1024, triangleRatio: 0.75 },
};
const VARIANT_RE = /-(low|medium)\.glb$/i;

function listGlbs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listGlbs(p));
    else if (entry.name.endsWith('.glb') && !VARIANT_RE.test(entry.name)) out.push(p);
  }
  return out;
}

async function buildIO() {
  await MeshoptSimplifier.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

async function makeVariant(io, src, tier, cfg) {
  const out = src.replace(/\.glb$/, `-${tier}.glb`);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    return { out, skipped: true };
  }
  const doc = await io.read(src);
  try {
    await doc.transform(
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [cfg.maxTexture, cfg.maxTexture],
      }),
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: cfg.triangleRatio, error: 0.001 }),
      dedup(),
      prune(),
      draco(),
    );
  } catch (err) {
    // A malformed mesh can break simplify; fall back to textures-only (the
    // dominant VRAM win) so the variant is still produced.
    console.warn(`  simplify failed for ${src} (${tier}): ${err.message}; texture-only`);
    const doc2 = await io.read(src);
    await doc2.transform(
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cfg.maxTexture, cfg.maxTexture] }),
      dedup(),
      prune(),
      draco(),
    );
    await io.write(out, doc2);
    return { out, skipped: false, degraded: true };
  }
  await io.write(out, doc);
  return { out, skipped: false };
}

async function main() {
  const arg = process.argv[2];
  const srcs = arg
    ? (statSync(arg).isDirectory() ? listGlbs(arg) : [arg])
    : listGlbs(ROOT);
  const io = await buildIO();
  let made = 0, skipped = 0;
  for (const src of srcs) {
    for (const [tier, cfg] of Object.entries(TIERS)) {
      const r = await makeVariant(io, src, tier, cfg);
      r.skipped ? skipped++ : made++;
      if (!r.skipped) console.log(`  ${tier.padEnd(6)}${r.degraded ? '*' : ' '} ${r.out}`);
    }
  }
  console.log(`\nDone. ${made} variants written, ${skipped} up-to-date.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

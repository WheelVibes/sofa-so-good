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
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * KTX2 / Basis Universal GPU-texture compression (opt-in `--ktx2`).
 *
 * WebP (the default) only shrinks the *download* — the GPU still expands it to
 * full RGBA in VRAM, which is the real ceiling on integrated GPUs. KTX2 stays
 * GPU-compressed *in VRAM* (ETC1S for colour, UASTC for normal/data maps), the
 * single biggest runtime-memory win for the LOD pipeline. The runtime decoder
 * (KTX2Loader) is already auto-wired by drei via `furniture/gltf/decoders.ts`.
 *
 * Encoding needs the KTX-Software `toktx` binary on PATH (gltf-transform shells
 * out to it). If it's absent we log a clear notice and fall back to WebP for
 * that run rather than producing broken variants — so this stays runnable on
 * machines without the toolchain, and a CI box / contributor with `toktx`
 * installed bakes the KTX2 siblings.
 */
const WANT_KTX2 = process.argv.includes('--ktx2');
function hasToktx() {
  try {
    execSync('toktx --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const KTX2_ENABLED = WANT_KTX2 && hasToktx();

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

/** The texture-compression transform for a tier: KTX2 when enabled (ETC1S for
 *  colour, UASTC for normal/data maps, auto-selected per slot by
 *  textureCompress), else WebP. Both resize to the tier's texture cap. */
function texturePass(cfg) {
  const resize = [cfg.maxTexture, cfg.maxTexture];
  if (KTX2_ENABLED) {
    return textureCompress({ encoder: sharp, targetFormat: 'ktx2', resize });
  }
  return textureCompress({ encoder: sharp, targetFormat: 'webp', resize });
}

async function makeVariant(io, src, tier, cfg) {
  const out = src.replace(/\.glb$/, `-${tier}.glb`);
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    return { out, skipped: true };
  }
  const doc = await io.read(src);
  try {
    await doc.transform(
      texturePass(cfg),
      weld(),
      // error: 0.01 is the gltf-transform default — at the tighter 0.001 most
      // models barely decimate (geometry win lost); 0.01 reaches the ratio
      // target where topology allows and is visually safe at LOD distances.
      simplify({ simplifier: MeshoptSimplifier, ratio: cfg.triangleRatio, error: 0.01 }),
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
      texturePass(cfg),
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
  if (arg && !existsSync(arg)) {
    console.error(`Path not found: ${arg}`);
    process.exit(1);
  }
  const srcs = arg
    ? (statSync(arg).isDirectory() ? listGlbs(arg) : [arg])
    : listGlbs(ROOT);
  if (WANT_KTX2 && !KTX2_ENABLED) {
    console.warn(
      'KTX2 requested (--ktx2) but the `toktx` binary was not found on PATH.\n' +
      'Install KTX-Software (https://github.com/KhronosGroup/KTX-Software) to enable\n' +
      'GPU-compressed textures; falling back to WebP for this run.',
    );
  }
  console.log(`Texture format: ${KTX2_ENABLED ? 'KTX2 (Basis Universal, GPU-compressed)' : 'WebP'}`);
  const io = await buildIO();
  let made = 0, skipped = 0, degraded = 0, failed = 0;
  for (const src of srcs) {
    for (const [tier, cfg] of Object.entries(TIERS)) {
      // One unreadable/corrupt GLB must not abort the whole batch.
      try {
        const r = await makeVariant(io, src, tier, cfg);
        r.skipped ? skipped++ : made++;
        if (r.degraded) degraded++;
        if (!r.skipped) console.log(`  ${tier.padEnd(6)}${r.degraded ? '*' : ' '} ${r.out}`);
      } catch (err) {
        failed++;
        console.warn(`  FAILED ${tier} ${src}: ${err.message}`);
      }
    }
  }
  console.log(
    `\nDone. ${made} written (${degraded} texture-only), ${skipped} up-to-date, ${failed} failed.`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });

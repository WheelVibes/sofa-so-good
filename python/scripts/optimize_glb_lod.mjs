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
 * KTX2 / Basis Universal GPU-texture compression — **the default since R7-H**.
 *
 * WebP only shrinks the *download* — the GPU still expands it to full RGBA in
 * VRAM, which is the real ceiling on integrated GPUs and on iOS Safari, whose
 * WebGL heap is roughly 300-500 MB and where memory is the top cause of WebGL
 * crashes. KTX2 stays GPU-compressed *in VRAM* (transcoded to BC on desktop,
 * ASTC/ETC2 on mobile), typically 4-8x less texture memory
 * (donmccurdy, "Choosing texture formats for WebGL and WebGPU applications",
 * 2024-02-11, https://www.donmccurdy.com/2024/02/11/web-texture-formats/).
 * `textureCompress` picks ETC1S for ordinary colour and UASTC for normal/data
 * maps per slot — the split Khronos' own tooling guidance recommends (ETC1S for
 * photos/albedo/specular, UASTC for anything that is not true colour data:
 * https://github.khronos.org/KTX-Software/ktxtools/ktx_create.html).
 *
 * The runtime side is wired: `src/scene/ktx2.ts` binds a `KTX2Loader` to the live
 * renderer and `furniture/gltf/loaderSecurity.ts:secureGltfLoader` hands it to
 * drei's shared `GLTFLoader` — drei's `useGLTF` never wires one itself.
 *
 * **The WebP fallback is no longer silent, and that is deliberate.** This script
 * used to accept `--ktx2`, quietly notice `toktx` was missing, and emit WebP
 * variants that look fine and are indistinguishable from KTX2 ones by filename —
 * a large part of why the repo shipped zero `.ktx2` assets outside test fixtures.
 * Now: KTX2 is the default, a missing `toktx` is a hard error, and choosing WebP
 * requires saying `--webp` out loud.
 *
 * This script shells out to `toktx` because that is the only encoder
 * `@gltf-transform/functions@4`'s `textureCompress` can route to. The app's own
 * asset pipeline (`scripts/asset-pipeline/ktx2-encode.ts`) needs no binary — it
 * drives the same Basis WASM encoder the browser uses.
 */
const WANT_WEBP = process.argv.includes('--webp');
/** `--ktx2` is now the default. Still accepted, as a no-op, so existing invocations work. */
function hasToktx() {
  try {
    execSync('toktx --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const KTX2_ENABLED = !WANT_WEBP;

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
  if (KTX2_ENABLED && !hasToktx()) {
    // LOUD, and fatal. A silent WebP fallback here produced variants that were
    // byte-plausible and named exactly like the KTX2 ones, so nobody noticed for months.
    console.error(
      'optimize:glb encodes textures as KTX2 by default, but the `toktx` binary was not\n' +
      'found on PATH. Install KTX-Software\n' +
      '  (https://github.com/KhronosGroup/KTX-Software — `brew install ktx` on macOS)\n' +
      'or re-run with `--webp` to deliberately accept download-only compression.\n' +
      'Refusing to silently emit WebP variants from a KTX2 pipeline.',
    );
    process.exit(1);
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

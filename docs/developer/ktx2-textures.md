# KTX2 / Basis Universal textures

How GPU-compressed textures are registered, loaded and encoded in this app, and what was measured
before any of it shipped (R7-H, `v0.35.14.0`).

All external sources accessed 2026-09-25.

## Why

A PNG, JPEG or WebP only shrinks the **download**. The GPU expands every one of them to
uncompressed RGBA8 on upload, so a 1024² map costs ~5.6 MB of VRAM with mips whatever it weighed on
the wire. KTX2/Basis stays compressed *in VRAM* — transcoded at load time to a GPU-native block
format (BC7/BC1 on desktop, ASTC or ETC2 on mobile) — which "typically cuts texture memory 4× to
8×" ([donmccurdy, *Choosing texture formats for WebGL and WebGPU applications*,
2024-02-11](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)).

That is a **mobile survival** issue here, not a polish item. iOS Safari enforces roughly a
300–500 MB WebGL heap and guidance is ASTC plus a 1024² cap absent a specific reason
([Wonderland Engine, *WebGL Performance on Safari and Apple Vision
Pro*](https://wonderlandengine.com/news/webgl-performance-safari-apple-vision-pro/)); memory is the
single most common cause of iOS WebGL crashes ([bugnet.io, *Fix: Unity WebGL Build Crashing on
Safari iOS*](https://bugnet.io/blog/how-to-fix-unity-webgl-build-crashing-on-safari-ios)). Safari
never exposes S3TC, which is exactly the case KTX2's load-time transcode exists to handle.

Measured on this repo before the change:

| population | count | payload on disk | est. VRAM as RGBA8 |
| --- | --- | --- | --- |
| baked lightmaps (`public/assets/lightmaps/`, 256², no mips) | 229 PNG | 10.42 MB | **58.6 MB** |
| furniture GLB textures (57 × 512², 114 × 1024², with mips) | 171 WebP | 7.43 MB | **717 MB** if every LOD tier were resident |

## Runtime: registration is renderer-bound, and it has to be

`KTX2Loader.detectSupport( renderer )` reads the **live** WebGL context's compressed-texture
extensions to choose a transcode target, and `load()`/`parse()` **throw** —
`'THREE.KTX2Loader: Missing initialization with .detectSupport( renderer )'` — until it has run
(three r184, `examples/jsm/loaders/KTX2Loader.js` lines 361 and 393;
[docs](https://threejs.org/docs/pages/KTX2Loader.html)). There is therefore no boot-time hook, which
is what `src/furniture/gltf/decoders.ts` has always said — but that file also *claimed* drei
auto-wired a loader via `useKTX2`. **It does not.** drei 10.7.7's `core/Gltf.js` builds its
`extensions()` callback from `extendLoader`, `setDRACOLoader` and `setMeshoptDecoder`, and nothing
else, so before this change **no shipped GLB could have carried `KHR_texture_basisu` at all**.

Three pieces:

- **`src/scene/ktx2.ts`** — the single `KTX2Loader`, its transcoder path, and `bindKtx2Renderer(gl)`.
  One instance app-wide: three warns that multiple active loaders each download a transcoder and
  allocate a worker pool.
- **`src/scene/Ktx2Controller.tsx`** — mounted FIRST inside both Canvases (`Scene.tsx`,
  `RoomEditorScene.tsx`), the sibling of `AnisotropyController`. The bind runs in `useMemo`, not
  `useEffect`: drei's `useGLTF` starts its fetch *during render*, and effects commit after the whole
  subtree has rendered, so an effect-based bind would be ordered after the first GLB request.
- **`src/furniture/gltf/loaderSecurity.ts:secureGltfLoader`** — already the `extendLoader` hook every
  runtime `useGLTF` call site passes (`GltfModel.tsx`, `DesignerViewport.tsx`, `thumbnails.tsx`), so
  it is where the loader reaches drei's shared `GLTFLoader`. It runs on *every* `useGLTF` call, which
  is what makes late attachment work.

**Context loss.** `detectSupport` only writes `workerConfig`, and that object is captured into each
transcode worker when the worker is created — so an in-place re-detect cannot reach workers that
already exist. `ContextLossGuard` bumps `contextRestoreSignal` on `webglcontextrestored` and
`Ktx2Controller` re-detects; when the supported format set has genuinely changed,
`bindKtx2Renderer` **replaces the loader outright**. It cannot reuse the old one: three's
`dispose()` revokes `workerSourceURL` but leaves `transcoderPending` set, so a disposed instance can
never rebuild its own workers.

**The transcoder is self-hosted** at `public/basis/basis_transcoder.{js,wasm}` — no CDN, works
offline — and `scripts/copy-decoders.mjs` now keeps it byte-identical to
`node_modules/three/examples/jsm/libs/basis/`. That sync matters: three generates its transcode
worker by concatenating its own `BasisWorker` source with this glue file, so a version skew fails at
transcode time rather than at build time.

**No device is left without a picture.** three's `FORMAT_OPTIONS` table ends in an unconditional
uncompressed `RGBA32` fallback, so a context exposing no compressed format at all still transcodes
correctly — it just gains no memory.

## Format choice: UASTC for lightmaps, ETC1S for albedo

Khronos' own tooling guidance puts ETC1S on "images, photos, map data, or albedo/specular textures"
and UASTC on anything that is not true colour data
([`ktx create` reference](https://github.khronos.org/KTX-Software/ktxtools/ktx_create.html),
[KTX-Software discussion #503](https://github.com/KhronosGroup/KTX-Software/discussions/503)), and
donmccurdy says the same in reverse — ETC1S is JPEG-class and "weak on data textures", UASTC matches
BC7 and is only 1–2× JPEG after Zstd supercompression.

A baked irradiance lightmap is data, and this set is unusually sensitive to quantisation: it stores
`pow(v, 0.5)` and the shader decodes `pow(t, 2.0)`, which *amplifies* error at the bright end.
Measured over all 229 shipped maps (`ktx2-encoder` at each setting, transcoded back to RGBA32
through the app's own `public/basis` transcoder, error expressed in the decoded space the shader
actually samples):

| setting | disk | mean abs err (decoded) | rms | max |
| --- | --- | --- | --- | --- |
| UASTC, `packUASTCFlags` 4, RDO off | 5.82 MB (56 %) | **0.151 counts** | 0.628 | 73.4 |
| UASTC, `packUASTCFlags` 2, RDO off | 5.75 MB (55 %) | 0.157 counts | 0.661 | 68.3 |
| ETC1S, quality 255, compression 5 | 1.43 MB (14 %) | **0.657 counts** | 1.991 | 153.6 |

ETC1S is 4.4× worse on the mean and 3× on the rms — it is not a close call for this population.
UASTC quality 4 ships.

Four encoder settings are load-bearing, and each is a way to get this silently wrong:

| setting | why |
| --- | --- |
| `isYFlip: true` | `TextureLoader` sets `flipY = true`; `CompressedTexture` sets it false and three cannot flip block data at upload. Without the flip at encode time every atlas slot samples upside down. |
| `isPerceptual: false`, `isSetKTX2SRGBTransferFunc: false` | The set is DATA sampled raw. An sRGB-marked container makes `KTX2Loader` tag the texture `SRGBColorSpace` and insert a transfer the PNG set never had. `prepareVisibilityTexture` additionally pins `NoColorSpace` as a second guard. |
| `generateMipmap: false` | `prepareVisibilityTexture` sets `generateMipmaps = false` / `minFilter = LinearFilter`, so mips would be uploaded and never sampled. |
| `enableRDO: false` | UASTC's rate-distortion pass trades texel accuracy for Zstd payload. On an irradiance map that accuracy *is* the calibration. |

## The calibration hazard

`IRRADIANCE_GAIN` (2.7) is pinned to `public/assets/lightmaps/` by a **hard equality** in
`src/scene/visibilityLightmap.test.ts` — gain and asset set are one calibration. A lossy re-encode
that shifts the maps invalidates the fit *silently*, because a mis-fitted gain and a correctly
fitted one both produce a perfectly plausible frame.

`scripts/dev-probes/ktx2-lightmap-ab.mjs` is the guard. It renders the same calibrated walk poses
under both sets in **one browser session**, in **linear light** (`ssg_linear_view`, per AGX-PARITY:
app counts are not Cycles counts and a comparison through AgX runs through a curve that compresses
the range the lightmap lives in), and refuses to report a KTX2 arm in which zero attached maps are
`isCompressedTexture` — because `lightmapTexture.ts` falls back to the PNG sibling when no
transcoder is bound, which would make the two arms identical for exactly the wrong reason.

```
# re-encode into a sibling directory, then A/B it against the shipped set
node scripts/asset-pipeline/encode-lightmaps-ktx2.mjs --out public/assets/lightmaps-next
PROBE_PORT=5213 scripts/dev-probes/with-server.sh ktx2-lightmap-ab.mjs \
  DIRS=lightmaps,lightmaps-next
# and ALWAYS run the same-set control first — see below
PROBE_PORT=5213 scripts/dev-probes/with-server.sh ktx2-lightmap-ab.mjs DIRS=lightmaps,lightmaps
```

**Run the same-set control before believing any A/B number from this probe.** The first run of it
compared the PNG set against the KTX2 set as two pages of one browser and reported 689 → 658
patched materials, 223 → 171 GL textures and a patch at **−14.98 counts**. Pointing both arms at
the SAME shipped PNG set reproduced −14.98 exactly: the second page loads its assets warm from the
HTTP cache, which reorders the lightmap attach against mesh creation. The probe now gives each arm
a fresh `browser.createBrowserContext()` with `page.setCacheEnabled(false)`, which takes the
same-set floor to **≤0.014 counts** and makes both arms report an identical 689 / 223. Every wrong
number reproduced to three significant figures across sessions, which is exactly what makes that
class of artefact dangerous.

**Result (four calibrated walk poses, 13:00, lights off, 36 patches):**

| | PNG control | KTX2/UASTC | |
| --- | --- | --- | --- |
| attached lightmap VRAM | 40.11 MB | 10.03 MB | **4.00×** |
| on disk | 10.42 MB | 5.82 MB | 0.56× |
| materials patched / GL textures | 689 / 223 | 689 / 223 | identical |
| worst calibrated-patch delta | — | **−0.104 counts** | vs a 0.014-count floor |

Real, at ~7× the noise floor, and an order of magnitude inside the ~1-count threshold that would
have re-opened the `IRRADIANCE_GAIN` fit. The transcode target on ANGLE/Metal is ASTC 4×4.

## Loading: format-aware, with a PNG fallback

`src/scene/lightmapIndex.ts` carries a `format` field (`'png' | 'ktx2'`) at the index level and per
map entry, so a **mixed** set is loadable and a format migration can be rolled out a few maps at a
time rather than as one irreversible swap. The declared format is validated *against the filename*,
because the filename is what gets fetched: a `.png` labelled `ktx2` would be handed to the
transcoder and throw, a `.ktx2` labelled `png` would go to `TextureLoader` and decode to nothing,
and both are invisible in a screenshot.

`src/scene/lightmapTexture.ts` dispatches per URL. Two things about it are non-obvious:

- **`KTX2Loader.load()` returns nothing.** `TextureLoader.load()` returns an empty `Texture`
  synchronously and fills it in later; the KTX2 loader hands the finished `CompressedTexture` to a
  callback. The applier needs a texture *synchronously* (it assigns into the material's `visMap`
  uniform in the same pass that compiles the shader), so the KTX2 path allocates an empty
  `CompressedTexture` and transplants the transcoded result's fields on arrival. Until `needsUpdate`
  is raised the texture's `version` stays 0, three never calls `uploadTexture`, and the sampler reads
  black — the same transient the PNG path already has.
- **The PNG fallback is not decoration, and it resolves a real file.** KTX2 needs a live context and
  a reachable transcoder, and a lightmap set that fails to load looks exactly like a
  correctly-working subtle lighting term. A `.ktx2` entry with no usable transcoder retries the
  sibling `.png` — which exists, because `public/assets/lightmaps/` ships **both**: each map as
  `<digest>.ktx2` (what `index.json` lists) and `<digest>.png` beside it. Naming the KTX2 files by
  their own content digest instead would have made that fallback a silent 404, so the encoder
  deliberately keeps the PNG's basename and only swaps the extension.
  The PNGs are excluded from the service-worker precache (`globIgnores` in `vite.config.ts`), so
  the offline install carries 5.8 MB of lightmaps rather than the 10.4 MB it used to — the
  transcoder wasm is itself precached, so the KTX2 path works with no network.

## Encoding

```
# lightmaps: PNG set -> sibling KTX2/UASTC set with its own index.json
node scripts/asset-pipeline/encode-lightmaps-ktx2.mjs \
  --src public/assets/lightmaps --out public/assets/lightmaps-ktx2 --quality 4

# GLB LOD variants: KTX2 is now the DEFAULT; `--webp` opts out, loudly
npm run optimize:glb
```

`python/scripts/optimize_glb_lod.mjs` used to accept `--ktx2`, quietly notice that `toktx` was
missing, and emit WebP variants that were byte-plausible and named exactly like KTX2 ones. That is a
large part of why the repo shipped **zero** `.ktx2` assets outside test fixtures. It now defaults to
KTX2, **exits non-zero** when `toktx` is absent, and requires `--webp` to be said out loud.

The app's own pipeline (`scripts/asset-pipeline/ktx2-encode.ts`, `processGlb(…, { ktx2: true })`)
needs no binary at all — it drives the same Basis WASM encoder the browser uses.

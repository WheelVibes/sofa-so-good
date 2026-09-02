# HQ path-tracer probe notes — harness lessons from the graphics-realism arc

Companion to **[visual-verification-playbook.md](visual-verification-playbook.md)**. That file's rules apply
here too; this one collects what the `.249`–`.296` graphics-realism rounds learned specifically about measuring
the **HQ path-traced still** (`scripts/dev-probes/light-distribution.mjs`, `PT=1`) and about screening
**reference photographs**. Findings about the render itself live in
`docs/research/2026-08-31-photoreal-shadow-depth.md`; product decisions in `docs/open-graphics-decisions.md`.

Read this before adding an arm to the PT branch. Sixteen of the last twenty rounds in that arc corrected an
earlier one, and most of the corrections were harness faults of the kinds below rather than graphics
discoveries.

---

## The HQ still is NONDETERMINISTIC — record which class you measured

`createHqRenderSession` returns one of **three discrete outputs** from identical inputs: same room, pose, hour,
tier, sample count, exposure and denoise setting. Measured at n=24 on one pose (bedroom3, `PITCH=0.30`, white
walls, medium tier, photographic look, hour 13, 1920×1080):

| class | frequency | upper-band L R−B | upper-band R R−B | whole-frame L |
| --- | --- | --- | --- | --- |
| **A** | 50 % | −10.1 … −10.6 | −12.8 | 155.7 – 156.5 |
| **B** | 42 % | +6.0 … +7.1 | +2.6 … +3.0 | 112.3 – 114.9 |
| **M** (mixed) | 8 % | +1.1 … +1.4 | −12.6 … −12.7 | 139.5 – 139.7 |

Each class is tight to **under one count** across a dozen runs, and A and B differ by **~17 counts in band
chroma and ~43 in frame mean** — far larger than most effects the arc was trying to measure. Filed as item
**(u)** in `docs/open-graphics-decisions.md`; **the cause is unidentified** after ten eliminated candidates.

**Consequences for any measurement:**

- **A single traced figure is meaningless without its class.** Two runs of the *same* configuration can differ
  ~45 % at an anchor.
- **A within-tracer A/B is void if its two arms are different classes.** This is what actually broke
  `.277`–`.279` — a white arm that read "31–35 % high" was simply a class-A frame. Two earlier rounds blamed
  sample count and the AI denoise instead.
- The probe prints `PT FRAME STATE` on every PT run (whole-frame mean + R−B, three-way with an explicit
  `UNKNOWN` bucket). **Do not delete the UNKNOWN bucket** — it is what catches class M, at ~1 run in 12.
- The classifier is calibrated on **white-walled** frames. A deliberately recoloured arm moves the same bands,
  so class assignment is **not available** for recolour A/Bs. Say so rather than guessing.

**Ruled out as causes** (each by measurement, not argument): sample count, the AI-denoise stage, exposure, the
environment branch (twice — once as a constant, once by direct observation), tone mapping, denoise/blank-render
failure, a per-capture tile race, camera pose, per-tile assignment.

## Validity check: does any interior surface out-radiate the APERTURE?

The cheapest, most physical sanity check available for an HQ still, and the one that finally settled which of
(u)'s classes is correct (`.298`). **In a room lit only through a window, no interior surface can be brighter
than the aperture lighting it.** Sample a patch inside the glazing pane and patches on the ceiling and walls,
and compare means:

| frame | class | glazing | ceiling | verdict |
| --- | --- | --- | --- | --- |
| class B | correct | 166.9 | 115.2 | interior 51 counts below the aperture ✔ |
| class A | **bug** | 170.9 | **181.5** | ceiling out-radiates the window ✘ |

Patches used on the bedroom3 pitched-up pose (`WINDOW=bedroom3 PITCH=0.30`), as normalized `x,y,w,h`:
`glazing 0.46,0.60,0.08,0.10` (inside the left pane, clear of the mullion), `ceiling 0.30,0.10,0.10,0.10`,
`wall-L 0.12,0.55,0.08,0.10`, `wall-R 0.84,0.42,0.07,0.08`. Check the patch sd — 0.7–1.3 on clean plaster and
glazing; anything much higher means the patch caught an edge or an object.

**Deliberately not a probe knob.** The patch coordinates are pose-specific, and `.293` shipped a pose-specific
classifier that misclassified a frame already known to be good. Pass the coordinates explicitly so the caller
declares the region, which is the actual lesson of that failure.

Two caveats. AgX compresses the bright end, so a violation measured in displayed counts **understates** the
radiance gap. And the app's glazing is a mid-tone panel that clips 0.0 % (item (l)), far darker than real
daylight — so this compares interior surfaces against *the app's own aperture*, which is the right internal
comparison but is not a comparison against a real sky.

## Confirm the renderer string — this probe never did, for sixty rounds

`light-distribution.mjs` launches with `--use-gl=angle --use-angle=metal --enable-gpu`, and the playbook's
real-GPU section warns in bold that getting the backend wrong *"silently gives you SwiftShader anyway — i.e.
every GPU-only check you thought you ran was a software render"*. The probe had never asserted it. It does now,
at boot, with a loud warning if the string looks like software:

```
WEBGL RENDERER: ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)
```

That is the expected string on this Mac, so the arc's path-traced work was real-GPU throughout — **established
in `.308`, assumed for the sixty rounds before it.** Never trust a GPU-only figure from a run that did not print
this line.

**Related debt worth naming:** the playbook also says *"Before calling a headless finding a product defect, ask
whether a real browser sees it"*. Item (u) was escalated to a product defect across `.298`–`.307` without that
check. Headless ANGLE/Metal is close to a real Chrome on macOS (same backend, same GPU), which makes it likely
real — but likely is not confirmed.

## Re-run any headless finding against the real compositor (`HEADED=1`)

The playbook's rule — *before calling a headless finding a product defect, ask whether a real browser sees it* —
went unpaid for ten rounds while item (u) was escalated to a product defect. `HEADED=1` launches a real windowed
Chromium instead of the headless offscreen path, which is the cheap approximation when Claude-in-Chrome is not
connected (a non-interactive session has no Chrome to attach to).

In `.309` the fault reproduced headed, matching the headless class-A signature **exactly** — ceiling 181.5 with
sd 0.88 in both — so it is not a headless artefact. What `HEADED=1` does **not** exclude is a user's own Chrome
(profile, extensions, default flags); it does exercise the real compositor, window surface and swap chain, and
`.308`'s renderer assertion confirms both modes use the same GPU and ANGLE backend.

**A severity claim carries its own verification debt.** Six rounds asserted "half of all HQ stills are wrong"
without noting the debt and none prompted the check; `.308` wrote it down and `.309` paid it one round later.
Write the debt into the entry.

## One PT run per shell call

A PT run is ~3–5 minutes including boot. Batching two in one shell call exceeded a 10-minute command timeout in
`.306` and killed the second mid-render, losing the run entirely. The constraints already say one probe at a
time on `:5199`; the same applies to the *call* that drives them. Poll or sequence across separate calls.

## Matching predictions of a SYMPTOM does not validate a MECHANISM

`.301` proposed that the traced ceiling renders at the environment's level because the ceiling was **absent or
transparent in the tracer snapshot**, and listed **six independent matched predictions**: equality with the
glazing, zero spatial variance, immunity to recolour, greenness above the glazing's, class A's cold cast, and a
ceiling out-radiating the aperture. `.302` censused the snapshot and found the ceiling **present, correctly
recoloured, and correctly substituted to PBR**. The lead was wrong while every prediction it made still held.

The reason is that all six are consequences of *"the ceiling renders as the environment"* — which is true — and
none of them distinguishes *why*. **A prediction only tests a mechanism if the rival explanations disagree
about it.** Before spending a round on a mechanism, write down what the *other* candidates would predict for the
same measurement; if they predict the same thing, the measurement is worthless as a test no matter how many of
them match.

Fifteen mechanisms have been proposed and refuted in this arc. This was the first refuted with its predictions
intact.

## Mark the patch on the PICTURE before you trust the patch

Three of this arc's costliest errors were mis-placed measurement patches: `.282` measured a region that was
converged from sample 1 and concluded the canvas was frozen; `.291` mistook *wall above the window* for
ceiling; `.293` averaged a gradient across furniture that swamped it. In `.300` a five-minute step — compositing
labelled rectangles onto the frame and looking — overturned an assumption three rounds old **before** it
reached a conclusion: the patch used since `.298` as a "zero-sky surface" was actually on the right **side**
wall, not the window wall.

```js
const rects = P.map(([n, x, y, w, h, c]) =>
  `<rect x="${x*W}" y="${y*H}" width="${w*W}" height="${h*H}" fill="none" stroke="${c}" stroke-width="6"/>` +
  `<text x="${x*W+8}" y="${y*H-12}" fill="${c}" font-size="34">${n}</text>`).join('')
await sharp(f).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}">${rects}</svg>`) }]).toFile(out)
```

Cheap, free of probe runs, and it makes "which surface is this?" answerable instead of assumed. Do it the first
time a patch set is used on a new pose, and again whenever a conclusion starts to depend on *which* surface a
patch is on.

## When a suspect light source cannot be removed, DYE it

Eleven candidate causes for (u) were eliminated by comparing the two classes on luminance, chroma and band
gradients — quantities that **mix light from every source**, so none of them could attribute anything. What
finally localised the fault in one round was forcing the tracer's `GradientEquirectTexture` to **pure uniform
green** (`topColor` and `bottomColor` both `0x00ff00`, so no gradient confounds the reading) and measuring
`green = G − (R+B)/2` per surface.

Two properties make this work, and both are worth copying:

- **A dyed source is separable.** Interior greenness ran 36–79 against a ~2 grey-environment baseline, so the
  environment's contribution could be read off directly instead of inferred from a difference of totals.
- **`root.background` gets the same texture, so the glazing is a full-environment reference in the same
  frame.** Its greenness was 58.2 / 59.4 / 59.9 across runs spanning both classes — proving the environment
  itself was invariant, which is what made "interior surfaces get 2.2× more of it" a meaningful statement
  rather than an uncontrolled comparison.

Do it as temporary instrumentation: back the file up, observe, restore, and verify with
`git diff --stat -- src/` that nothing survived.

## Reading the tracer canvas: you may get either of two different images

`HqRenderModal.tsx` shows `session.canvas` (the tracer's WebGL canvas) while rendering, and on completion
`finalize()` **clears the host and appends a different canvas** — a plain 2D `denoisedCanvas` — whenever
`aiDenoise` is armed and `applyAiDenoise()` returns non-null. `hqRenderSession.ts` then prefers it:

```ts
toDataURL: () => (denoisedCanvas ? denoisedCanvas.toDataURL('image/png') : canvas.toDataURL('image/png'))
```

So **the same probe code returns the raw trace or the denoised output depending on timing**, and the user's
saved PNG has the same duality. The two are radiometrically within 1.1–1.6 % of each other (measured with the
flag forced both ways), so this is a labelling problem, not a magnitude one — but an unlabelled mixture across
runs is not a dataset.

**Label the stage.** The probe prints `PT STAGE: raw-trace | ai-denoised`, detected with:

```js
let stage = 'raw-trace'
try { if (c.getContext('2d')) stage = 'ai-denoised' } catch { stage = 'raw-trace' }
```

**Do not test for a WebGL context instead.** `getContext('webgl2')` returns **null** on a canvas that already
holds a WebGL1 context, so that test mislabels — it reported `ai-denoised` for a frame whose values were plainly
the raw trace. Caught only because the label contradicted the numbers.

## A frame-wide statistic needs its REGION declared

The single most expensive family of errors in the arc. Three instances:

| Symptom | Cause | Check |
| --- | --- | --- |
| A fixed patch reads *identically* at 4 samples and at 256, so the canvas looks frozen | The patch was in a region converged from sample 1 (a flat ceiling lit almost purely by the environment). Neighbouring wall patches converged normally: sd 7.65 → 1.33, mean +5.6 % | Measure **several** patches on surfaces with **different convergence rates** before concluding anything about convergence or staleness |
| A left-vs-right classifier calls every frame anomalous, including the known-good one | Averaged over the **whole frame height**, where warm furniture in the lower third swamps a gradient that exists only in the upper wall/ceiling band | Declare the band (`y = 0.19–0.46` for the pitched-up bedroom pose) and validate the classifier against a frame already known to be healthy |
| Two frames "share an asymptote", so the fault looks spatial | The two frames profiled were the **same class**; the third class was never profiled | When comparing classes, verify each arm's class first |

**A frame-wide number summarises a spatial field. If you cannot say which region it describes, it does not
describe anything.** Corollary: validate every new classifier against a frame whose answer you already know,
and revert it if it misclassifies that frame — `.293` built one, it failed that test, and it was reverted rather
than shipped.

## Wire up the observation channels before the hypotheses

The probe had **no `page.on('console')` listener at all** for the whole arc. `hqRenderSession` logs
`HQ AI denoise failed`, `HQ render failed` and a blank-render guard behind `import.meta.env.DEV`, and rounds
`.280`–`.283` speculated about exactly those failures while being structurally unable to see them. Once the
listener existed, **four candidate causes fell in a single round**, each to one line of logging and no
reasoning.

```js
page.on('console', (m) => { /* tagged lines + all warnings/errors, minus Vite/HMR noise */ })
page.on('pageerror', (e) => console.log(`  PAGE ERROR ${e.message}`))
```

Add the listener, and a temporary `console.log` inside the code under test, **before** theorising about it.
Temporary `src/` instrumentation is fine for one round: back the file up, observe, restore it, and verify with
`git diff --stat -- src/` that nothing survived.

## Check whether a candidate cause is even a VARIABLE before A/B-ing it

`.285` spent four probe runs building an A/B against the tracer's environment fallback. `.286` then found
`store.hdriId` defaults to **null**, so `hqEnvironmentUrl` returns null, so `hdriUrl` is `undefined` on *every*
default run and the gradient branch is taken every time. **A constant cannot be the variable.** The check cost
one grep of `src/state/slices/uiSlice.ts`.

Related trap: forcing a store value to make an A/B arm can move things you did not intend. Setting `hdriId`
reset `scene.environment` to null **and moved the camera**, so the "arm" was a different room at a different
pitch — with plausible-looking anchors, sample count and frame state. Only looking caught it.

## Interception, not assignment — and always read back after the capture

`Lighting.tsx` recomputes `hemi.groundColor` and intensities **every frame**, so a probe that assigns them sees
its values reverted before the capture. Wrap `setRGB` or install an `Object.defineProperty` getter instead. And
regardless of method, **re-read the value after the capture and print it** — two dead-flat sweeps were published
in the arc, and only a post-capture read-back caught them.

## Before running a new measurement, check the outputs of the OLD ones

Two consecutive rounds (`.294`, `.295`) cost **zero probe runs**, used frames already sitting in `/tmp`, and
each overturned a published conclusion — one by measuring n=24 instead of n=3, the other by classifying every
saved frame and finally attributing an anomaly that three earlier rounds had explained three different ways.
The `.285`–`.293` span had spent roughly twenty probe runs (~two hours) generating exactly the frames needed,
then reasoned from three of them.

**`OUT=` directories are a dataset. Inventory them before you generate more.**

## Driver-script traps (zsh)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Env values arrive as `NaN`, rows look plausible but mean nothing | `set -- $cfg` / `${cfg}` **does not word-split in zsh** | Explicit functions with positional parameters |
| A whole compound command silently does nothing, including a heredoc that was supposed to patch a file | A helper function named `b` collided with a shell **alias**; the *parse* error aborted everything | Avoid one-letter helper names; verify the edit landed by its behaviour, not by `grep -c` |
| `grep -c` reports the expected count, but behaviour is unchanged | A multi-line find-and-replace matched nothing because the formatter had collapsed the expression | Check the **behaviour**, never the match count |
| Module-not-found after a tool timeout | The Bash working directory reset to the repo parent | `cd` in every call |

## Reference-photograph screening (Wikimedia Commons)

For the ceiling ÷ wall metric the arc needs: plaster on **both** surfaces, daylit, ceiling in frame and
croppable clear of junctions, no flash/HDR, not CG. Yield across three screening rounds was **3 of ~63 (~5 %)**
and *falling* as a seam is worked deeper.

- **Use the thumbnail route.** `iiurlwidth=1200` returns a `thumburl`: **352 KB vs 6.9 MB, 20× smaller**. And
  **patch means are scale-invariant** — ceiling ÷ wall = 1.106 from both a 1280 px thumbnail and a 4032 px
  original. **Not** valid for micro-contrast/micro-sd, which is resolution-dependent by construction.
- **Two separate rate limits.** `upload.wikimedia.org` 429s after ~7 full-resolution downloads (thumbnails do
  not trigger it); the **API** 429s independently and needs ~2.2 s pacing plus `--data-urlencode` per field —
  titles containing `&` or `°` will otherwise break the query string and look like a broken parameter.
- **Dedupe by upload batch.** One villa shoot was **ten of eighteen** files in one sweep; eighteen files were
  really nine independent interiors.
- **Seams matter more than volume.** Living-room categories yielded 1/9; hospitality categories (lobbies,
  corridors, restaurants, stone halls — artificially lit) yielded 0/6; `Bedrooms` yielded 0/19 and is exhausted,
  because bedroom photography usually excludes the ceiling and bedrooms disproportionately have a coloured
  feature wall or lamps on.
- **Provenance is a prior that says look harder, not a verdict.** An estate agency's own upload and a home
  stager's own upload are the same provenance class; one is CG and one is a real single-exposure photograph.
  The **discriminating test is absent contact shadows plus absent cross-room falloff** — a CG interior has no
  shadow under the chair legs or lamp base and its far wall is as bright as its window wall.
- **Crop choice moves the answer ~5 %.** The same photograph measured 1.03 and 0.976 with two independently
  verified-clean crops. Do not quote a band endpoint to better than that, and do not claim a match tighter than
  the crop uncertainty.
- **Look at every crop.** Five rounds in the arc published or nearly published a contaminated patch; the largest
  quantified error was **6.3 %** from one dark object intruding into a corner of one wall patch (`sd = 19.18`
  gave it away — clean plaster is ~5).

## `light-distribution.mjs` PT knobs added by this arc

| knob | effect |
| --- | --- |
| `PT=1` | capture a pose-matched path-traced still after the raster pass |
| `PTSAMPLES=<n>` | requested sample count (the modal runs to its own 256 cap regardless) |
| `PTNOWAIT=1` | skip the completion wait (reads mid-render — see the stage note above) |
| `PTTRACE=1` | sample a fixed patch of the tracer canvas on every poll during the render |
| `PTHOLD=<s>` | keep sampling for `<s>` seconds *after* the target count is reached |
| `PTDOUBLE=1` | re-capture the same settled render twice more, 5 s apart |
| `PTSHOT=1` | full-page screenshot on every poll (the compositor, not a canvas read) |
| `PTGL=1` | compare `drawImage` against `gl.readPixels` on the same patch |
| `PTLIST=1` | inventory every canvas (backing store, CSS size, visibility, parent) |
| `PTPROFILE=1` | R−B across 24 columns over a y band (`PTPROF_Y0`/`PTPROF_Y1`, default the upper third) |
| `PTEXPO=1` | log `gl.toneMappingExposure` and `toneMapping` at modal-open and at Start render |
| `PTAI=off\|on` | force the `hqAiDenoise` feature flag, asserted and read back after capture |
| `PTHDRI=off\|on` | force `hdriEnvironment` + `hdriId` (`PTHDRIID`) — **note it also moves the camera** |

`ANCHORS=1` and its `ANCHOR_*` knobs give a **world-anchored, framing-invariant** metric: the same world point
reads within 0.3 % across two different camera pitches. Prefer it over any screen-space band for anything
compared across poses.

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

## Test an EMERGING pattern before it becomes a finding

`.302`'s rule (write down what the rivals predict before spending a round) applies to patterns you notice, not
only to hypotheses you state. In `.311` two consecutive paired runs came out **A then B**, which would have
meant a systematic cold-first-render effect — with an obvious workaround attached, making it very tempting to
publish. The third pair came out **A then A** and killed it. Cost: one run. Had it gone in at n = 2, a later
round would have had to withdraw it, as happened in `.291`, `.292` and `.301`.

Related: quote the counts, not the impression. `.311`'s tallies were first renders 12 A / 5 B, second renders
1 A / 2 B — enough to say "both classes occur in both positions" and *not* enough to claim a position effect.

## A BASELINE arm must be verified to be in the same (u) class

Two rounds published results that had to be withdrawn because their "no ambient" baseline was a **class-A**
frame. In class A the ceiling is replaced by the environment, so it stops being a **bounce surface** and the
whole room reads darker: **sidewall 69.4 (class A) vs 100.3 (class B)** under the same near-zero environment — a
31-count understatement that inflated every derived figure (`.312`, `.324`).

**Check the class of every arm, including baselines.** `PT2=1` gives a paired sample per boot, and a
**hue-discriminating environment** identifies the class at any luminance:

- **Black does not work** — a class-A void and a genuinely unlit ceiling both read 0.0.
- **Dim blue (`0x000030`) does** — faint enough not to swamp the scene lights, and its R−B is −48 where room
  bounce is +8, so the **sign** separates the classes: ceiling R−B **−65.0** = class A, **+12.2** = class B
  (`.325`).

Bonus: this also gives (u)'s mechanism its strongest test. "Class A replaces the ceiling with the environment"
predicts the class-A effect **reverses sign** with the environment's brightness — class A is brighter under the
normal grey gradient (ceiling 181.5 vs 115.2) and **darker** under dim blue (6.8 vs 96.6). It does.

## Use `PT2=1` for paired samples — two renders per boot

Every (u) experiment before `.310` paid ~3.5 minutes of page boot and scene load **per class sample**, and
needed 2–3 runs to see both classes. `PT2=1` clicks the modal's **Re-render** and captures a second still in the
same page session, so one run yields a **paired A/B**.

That halves the cost and, more usefully, **removes page-boot variance as a confound**: in `.310` render 1 came
out class A (ceiling 181.5, sd 0.88) and render 2 class B (ceiling 1.0, sd 0.00) with the same page, in-memory
scene graph, dev server, wall-clock minute, GPU and renderer string. Prefer paired samples for any comparison
that has to hold the environment constant.

Note each render constructs a new `WebGLRenderer` on a new canvas, so the two renders do **not** share a GL
context — a paired sample holds *page* state constant, not context state.

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

## Why photographic anchoring is a closed loop here (`.320`)

The requirement is self-contradictory for **found** photographs, and it can be shown with arithmetic:

- **Pose-fragile metrics need a matched pose.** A reference photograph's aspect and focal length come from EXIF
  (`.288`: `At_La_Palma` is an iPhone 12 Mini, 4:3, ≈26 mm ⇒ vertical FOV 49.6°), but **pitch does not**. The
  vanishing-point method is ill-conditioned when the dominant wall is near-frontal — on `At_La_Palma` it puts
  the horizon *above the frame*, which is impossible since the ceiling is visible.
- **The rigorous bound is too loose.** The horizon must lie between a wall's ceiling and floor junctions
  (y ∈ [0.16, 0.57]), which brackets the pitch to **17.4° down … 3.7° up — 21.1°**. The ceiling-falloff metric
  traverses its **whole** range (0.847 → 1.059) over **17.2°** of pitch (`.319`). **The bracket is wider than
  the metric's dynamic range.**
- **The framing-invariant alternative cannot reach a photograph.** `ANCHORS=1` is world-anchored (`.285`, 0.3 %
  across two pitches) and therefore works only on the app's own renders — a photograph has no world coordinates.
- **The one pose-robust quantity cannot be anchored.** Interior chroma is stable to 0.9 counts on pitch
  (`.316`) but follows the *exterior's* colour, which differs between any two real rooms (`.317`, three
  attempts).

**So: use photographs for qualitative screening and for pose-robust bounds only. For anything quantitative, compare
the app against itself at a matched pose** — the raster as reference (`.314`). Every surviving quantitative
result in `.310`–`.320` is of that form.

## Every LUMINANCE spatial metric here is pose-dependent; chroma is pose-robust but unanchorable

The arc's measurement predicament, after seven rounds of trying both families:

| metric | pose behaviour | round |
| --- | --- | --- |
| ceiling ÷ wall luminance | 0.68 → 0.96 on pitch | `.232` |
| wall falloff | 0.74 → 0.93 on viewport aspect; retired | `.247`, `.249` |
| same-surface ceiling far ÷ near | **0.85 → 1.06 on pitch** | `.319` |
| interior chroma | **0.9 counts on pitch — robust** | `.316` |

**Luminance carries the photographic anchor and is pose-fragile. Chroma is pose-robust and cannot be anchored**
(`.317`: three attempts, all defeated by the exterior's colour). This looks structural rather than a matter of
finding the right variant.

**What survives:** pose-matched, same-frame comparisons of the app against **itself** — the raster as the
reference for the tracer (`.314`). Both arms share the pose by construction, which is why it has survived every
pose and placement challenge. Prefer it, and treat any photograph-referenced band as un-validated until its
pose-dependence is measured.

## A metric that looked anchorable and was not: same-surface CEILING FALLOFF (far ÷ near)

Two patches on the **same ceiling**, one near the aperture and one far from it; report `far ÷ near` luminance.

| property | why it holds |
| --- | --- |
| photographically anchorable | consistent sign across all three references: **0.765 / 0.844 / 0.895** (`.318`) |
| sensitive to the lighting rig | raster **0.862** vs traced **0.974** — 0.11 separation, where ceiling ÷ wall gave 2.8 % (`.313`) |
| exposure-invariant | within-frame ratio |
| albedo-controlled | one surface, one paint |
| aperture-referenced | by construction |

**The result it produced:** the HQ still's ceiling is **too flat** (0.974) against every reference photograph and
against the app's own raster (0.862) — it lights the far ceiling almost as brightly as the near ceiling. Class A
is flat to within 1 % (1.009).

**❌ POSE-DEPENDENT — the band comparison is withdrawn (`.319`).** Across three pitched-up bedroom3 poses the
raster reads **0.847 / 0.862 / 1.059** at pitch 0.15 / 0.30 / 0.45 — a 0.21 swing crossing 1.0, wider than the
photographic band itself. Two further problems surfaced: the `near` patch placement was never physical (moving
it to the window-wall junction shifts the 0.30 figure 0.862 → 0.912, a third of the band's width), and the
`far` patch straddles the cornice gradient at shallow pitch (sd 21.5 at 0.15, 9.6 at 0.30, 1.3 at 0.45 — the
poses where the metric looked best are where its far patch was worst).

**What survives:** the **raster-vs-traced** figure at a single matched pose (0.862 vs 0.974) — pose-matched by
construction. Use it as an internal comparison, not as a photographic verdict.

Contrast the chroma version, which fails (below): the exterior's *colour* scrambles chroma but does not scramble
how much *less* light reaches the far end of a ceiling.

## Chroma cannot be anchored to photographs — three attempts, one reason

Chroma is the arc's best **internal** instrument and its worst **photographic** one. Three separate attempts to
anchor it to reference photographs have failed:

| attempt | round | why |
| --- | --- | --- |
| ceiling − wall Δ R−B | `.292`, `.315` | straddles zero, tracks **floor colour**; 16.4-count band on n = 3 |
| absolute interior R−B | `.314` | not white-balance invariant across sources (`.267`) |
| same-surface gradient from the aperture | `.317` | 47-count spread, **sign flips** with what is outside the window |

**The reason is the same each time: chroma is set by the exterior environment and the room's own materials.**
`At_La_Palma`'s sunlit balcony bounces warm light onto the ceiling *nearest* its window (+31.2, the warmest
patch in the reference set); `Vogtsbauernhof`'s window sees cool sky, so its near ceiling is cool (+2.4) and its
far ceiling is warmed by timber floor and furniture (+26.4). Both are correct rooms; they simply disagree.

**Do not try a fourth variant.** Use chroma against the **raster** (same room, pipeline and white balance) and
use luminance ratios — with their insensitivity and pose-dependence stated — for photographic comparison.

## Prefer CHROMA over the luminance ratio

Two rounds measured the arc's two candidate metrics on the axes that matter:

| | sensitive to the lighting rig? | pose-robust? |
| --- | --- | --- |
| ceiling ÷ wall luminance | **no** — 2.8 % for a 66 % change in the dominant light (`.313`) | **no** — 0.68 → 0.96 on pitch (`.232`) |
| interior chroma (R−B) | **yes** — 6.1 counts for (p), 20–28 for (u) (`.314`) | **yes** — 0.9 counts on pitch (`.316`) |

Interior chroma sees the defects the ratio cannot and barely moves on the axis that wrecks the ratio. Use it,
with the raster as the reference — same room, same pipeline, same white balance, and reproducible to 0.1 counts
across boots (`.315`).

Two limits: **absolute** R−B does not cross to a photograph (white balance, `.267`) — only the **within-frame**
ceiling−wall Δ does (`.315`), and that band is wide and non-systematic. And chroma is only as good as the patch,
so mark and look (below).

## A patch set is verified for ONE pose only

Two attempts to reuse a verified patch set at a new pose have failed. `.291` mistook *wall above the window* for
ceiling. `.315` tried to test pose-dependence at `PITCH=-0.06` with patches verified at `+0.30`, and marking
them showed the "ceiling" patch on the **window wall** and the "wall" patch squarely on a **framed picture**.

Surfaces move with the camera; normalized coordinates do not follow them. **Re-mark and re-look for every new
pose**, and expect some poses to have no usable patch at all — bedroom3 at eye level has almost no croppable
ceiling (a thin strip, partly behind the HUD toolbar).

## Raster-vs-traced: any patch touching the HUD is invalid by construction

The raster (`frame.png`) carries the app's **HUD** — toolbar top-centre, minimap bottom-right, Measure button
top-right — and the traced canvas does **not**. So a patch overlapping any of them compares HUD pixels against
scene pixels. In `.323` the intended wood and lampshade patches both sat on the **minimap** and had to be
replaced.

This is specific to raster-vs-traced work and it is not caught by an sd check — the minimap is locally flat in
places. **Mark the patches on the raster and look**, then measure both frames with the same coordinates.

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

## The tracer's environment must be a DataTexture with `image.data`

`isReusableEquirectEnvironment` tests `t.image` for truthiness. That is not the condition the tracer needs.
`EquirectHdrInfoUniform` builds its importance-sampling CDFs from `const { width, height, data } = map.image`,
so the environment must carry a typed array. An `HTMLCanvasElement` has `width`/`height` and **no `data`** —
it passes the predicate and then produces **0 samples, no tracer canvas, no page error and no GL warning**
(`.326`). A silent total failure, so do not read "the modal produced nothing" as a probe bug.

To feed the tracer a canvas-backed equirect, convert it: read the canvas to a `Float32Array` and build a
`DataTexture` (RGBA / FloatType / EquirectangularReflectionMapping / Repeat / ClampToEdge / Linear, mirroring
`ProceduralEquirectTexture`), decoding **sRGB → linear** on the way. The tracer integrates radiance; canvas
pixels are display-encoded.

## Re-derive the (u) discriminator under whatever environment is in force

`.325`'s rule was that a baseline arm must be in the same (u) class as the arm it baselines. `.326` found the
sharper version: **any intervention on the environment invalidates a (u) discriminator calibrated under the
old one.** `.325`'s reference values (class A 181.5, class B 115.2) hold only under the hardcoded grey
gradient. Under a converted sky the classes sit **10.5** counts apart instead of 66, and in the **opposite
direction** — class A becomes the *darker* one, because a faithful sky radiates into the ceiling direction at
nearly what a correctly-bounced ceiling reads.

`.305`'s acceptance test is the instrument that survives, because it is a within-condition comparison: run
`HIDECEIL=1` under the *same* conditions as the arm being judged, and require the traced ceiling to differ
from the hidden-ceiling value. Never carry a class threshold across an environment change.

## A 256-sample PT run takes ~7½ minutes — launch it with an explicit timeout

Measured `.326`: 20:15:21 → 20:22:41 end to end. That is close enough to the default background-command limit
that a run gets **killed mid-trace**, leaving `frame.png` written and no `pathtraced.png` — which looks like a
tracer failure and is not one. Check the task's own start/end stamps before diagnosing anything.

`.306` lost a batch to the 10-minute *foreground* limit, which is why runs are one-per-call; note the
background default is **tighter** than that, not looser.

## Read patches with `patch-read.mjs`, and look at the overlay it writes

`scripts/dev-probes/patch-read.mjs <out-dir> <img[:label]> [img2[:label2]] -- name=x,y,w,h ...`

Fractional rects, so one set applies to both a deviceScaleFactor-2 raster capture and the traced canvas at its
own backing size. Prints mean L, mean R−B and sd per patch, plus the delta when two images are given.

It writes a **marked overlay on every run**, not on request. Every raster-vs-traced round since `.298`
re-implemented this reading inline and the recurring failure was never the arithmetic — it was patches landing
somewhere other than intended (`.300` the wrong wall, `.315` the window wall and a framed picture, `.316` the
HUD toolbar and a structural beam, `.319` a patch never physically placed, `.323` the HUD minimap). A patch set
is verified for **one pose only** (`.247`, `.320`).

## The traced window has no security grille; the raster's does

`.326`, bedroom3: the raster's window carries a full grille and the traced window shows a single mullion. Any
glazing patch is therefore **not like-for-like** — four bars cross it in the raster and none in the trace,
which reads as raster sd 24.3 against traced 0.7. This is a snapshot-fidelity gap independent of lighting, and
it means `.323`'s glazing row may carry the same contamination. Check the two frames before comparing anything
inside a window opening.

## `ENVDUMP=1`

Reports `scene.background` and `scene.environment` against the exact clauses of
`isReusableEquirectEnvironment` — ctor, render-target flag, mapping, image kind, dimensions, `wouldPass`. Cheap
(no PT run) and the fastest way to see what the tracer is being offered versus what it uses.

## Exact equality is evidence of a NO-OP, not of stability

`.327` lost two runs to interventions that silently did nothing, and the signature was the same both times: a
figure reproduced **to the last decimal**. A real intervention essentially never does that — noise forbids it.
The raster arm reading `70.0 / 7.4 / 7.3` twice over is what condemned the run, and it is a stronger signal
than any plausibility check on the value itself.

Corollary, and it applies well beyond this probe: when a change leaves a metric — or a test suite — *exactly*
unchanged, that is cause for **suspicion rather than confidence**.

## Verify the intervention landed, separately from measuring its effect

Two levers that look like they dye the floor and do not:

- **`FLOOR=<id>` re-finishes the LIVING/DINING floor only.** Passing it while posed in another room changes
  nothing. `.327` did exactly this in bedroom3 after reading the knob's own comment saying so.
- **`RECOLOR` matches `material.color` by hex, and a floor's catalog colour is a PAINTER INPUT** to the
  generated texture, not the material colour. The material is white with a `map`, so `#d6b38d` matches nothing
  and the knob reports `repainted: 0`.

So assert the precondition and print it, *then* measure. `FLOORDYE` throws on zero hits for this reason. The
guard that actually works is a **control arm that should be inert** — in `.327` the raster arm, which has no
floor-bounce term and so must not move when the floor is dyed.

## Independent-looking signals are not independent if one confound drives them

`.327` designed its test around luminance **and** hue, on the reasoning that no confound moves both. (u) moves
both — and moved both in the direction the hypothesis predicted, on an intervention that had not fired. Signal
redundancy is not a substitute for a control, and it is not a substitute for classifying the arm.

## Keep the failed arm

`.327`'s dye-did-not-land run was what exposed the false positive: the corrected run reproduced it to **0.1
counts**, proving the effect was (u)'s class and not the intervention. Had the failed run been discarded as a
botched attempt, the corrected run's +38.6 would have read as a confirmed mechanism. A run whose intervention
misfired is still a valid same-class sample — label it and keep it.

## The rasteriser has no floor-bounce term for walls or ceiling

`.327`: with the floor dyed dark navy, the raster's wall and ceiling patches are **byte-identical**. Consistent
with the hemisphere's `groundColor` being a global constant rather than anything read off the actual floor
material. Two consequences: the raster arm is a usable inert control for any floor-albedo intervention, and the
raster cannot be treated as a reference for a **bounce-only** surface — one coplanar with the aperture, which
sees no sky and takes no direct sun — because it has no mechanism to light it at all.

## The best (u) discriminator: dye every surface near-black and read the ceiling

`DYEEXCEPT=0a0a0a` (or `FLOORDYE` plus anything that blackens the ceiling) makes the two (u) classes separate
by **178 counts**:

| | ceiling patch |
| --- | --- |
| class B — ceiling rendered, dyed albedo | **0.0** |
| class A — ceiling absent, environment shows | **178.2** |

The intervention removes the ceiling's own albedo while leaving the environment behind it untouched, which is
exactly what the two classes differ on. It is `.305`'s acceptance test at maximum sensitivity, it is
**probe-only** (no `src/` change), and it beats every earlier discriminator: `.325`'s dim-blue R−B sign test
separated by 66 counts and needed a temporary `src/` edit; under `.326`'s converted sky the classes sit only
10.5 counts apart. **Prefer this one.**

Budget for the tax: `.328` had 3 of 4 traced arms land in class A and needed two paired runs (four renders,
~12 min) to get one class-B arm. Class A is deterministic across boots — `.328` reproduced 106.3–106.4 / 111.6 /
178.2 in separate page sessions to 0.1 counts.

## `getWorldDirection` is a surface normal only for a PlaneGeometry

For a box, cylinder or sphere it returns the object's **orientation**. `.328`'s first partition spared 543
meshes — books, a lamp, a plant — because their local +Z happened to point at the camera, while they carried on
bouncing light into the measurement. Any normal-based mesh selection must gate on
`o.geometry?.type === 'PlaneGeometry'` and dye everything else regardless of how it is turned.

## A no-PT check run is not framed like a trace run

`PT=1` pins the walk viewport to 16:9; without it `VH` defaults to 800 and the capture is 16:10. A cheap no-PT
run is the right way to confirm an intervention landed — it takes ~20 s instead of ~4 min — but its
**fractional patches are not comparable** with a trace run's (`.247`). Confirm the pose separately (`reached`
and `standoff` in the probe's own JSON) rather than inferring it from how the frame looks; `.328` misread a
darkened 16:10 frame as a pose shift when the pose was byte-identical.

## The rasteriser has NO interreflection at all — so it cannot be a reference for a bounce-only surface

`.328`: with **1062 meshes dyed near-black**, the raster's two window-wall patches were byte-identical to the
decimal (70.0 and 115.2) while the dyed ceiling read 0.0, proving the dye landed. Raster wall luminance is a
pure function of the analytical lights and is entirely independent of scene albedo.

Consequence for method: a surface **coplanar with the aperture** sees no sky and takes no direct sun, so bounce
is the only light that physically reaches it. The traced window wall is bounce-dominated (−67 % and −85 % when
the room's bounce is removed). Where the two renderers disagree on such a surface, **do not assume the raster
is the value to move toward** — it has no mechanism for the light in question. `.323`'s "the tracer's largest
error is on the surface that should be darkest" is retired on this basis.

## Do not decompose tone-mapped counts into additive terms

`.328` was tempted: the raster's total on the sky-blind wall (70.0) is close to the trace's apparent bounce
delta (105.8 − 34.4 = 71.4), which invites "the raster's fill approximates the bounce term but omits the direct
one". Displayed counts under AgX are **not energy**, so `34.4 + 71.4 = 105.8` is not valid addition and the
split is not a legitimate decomposition. Report the dominance, not the partition.

## Probe plan reads are shape-tolerant — do not "simplify" them back

`light-distribution.mjs` reads the floor plan through, at every site:

```js
const levelsOf = (p) => p.levels ?? [p, ...(p.upperLevels ?? [])]
const allOpenings = (p) => levelsOf(p).flatMap((l) => l.openings ?? [])
```

This exists because a schema migration on another branch deletes `plan.rooms`/`walls`/`openings` and
restructures to `plan.levels: PlanLevel[]` with the ground floor as `levels[0]`. These probes run in the
**browser** via `page.evaluate`, so they cannot import `src/floorplan/levels.ts` — the flattening has to be
inline.

**The tempting shorter form is wrong**: `[plan, ...(plan.upperLevels ?? [])].flatMap(l => l.walls ?? [])` reads
the ground floor as `plan` itself, so after the migration it contributes nothing and the probe silently returns
the upper storeys alone — or `[]` on a single-storey plan. That surfaces as "no window matched", i.e. as a
scene bug rather than a schema change. Same silent-plausible-result trap as a bare `?? []`.

When the migration lands, the other 15 `scripts/dev-probes/*.mjs` need the same treatment. Related: per-room
maths must use the room's **own storey's** ceiling height, not the ground floor's — this arc's photometry reads
no ceiling height, so it is unaffected, but a future probe that does would be.

## Authority is a one-renderer question; correctness is a two-renderer question

`.333` and `.336` both used this, and it is the cheapest useful pattern in the arc.

Before extending a calibration to a new condition, ask whether the **lever still has authority** there. That is
measurable in the raster alone — ~20 s per run, no (u) tax — where the required *value* needs a class-matched
tracer pair at ~30 minutes.

Results so far for the hemisphere ground term on the ceiling:

| condition | authority |
| --- | --- |
| 13:00, bedroom3 | −41 % |
| 13:00, livingDining | −38 % |
| 13:00, mainBedroom | −45 % |
| 13:00, bedroom2 | −46 % |
| **21:00, bedroom3** | **−2.4 %** |

Room-stable to ±10 % relative; **hour-catastrophic**. So the lever generalises over rooms and not over hours,
and that was established in minutes rather than hours. Use the **geometric mask** (`ceiling N.NN wall N.NN
floor N.NN (normalised by their own combined mean M)`) to recover absolutes without hand-placing a patch per
pose — multiply the normalised figure by the combined mean.

## Pre-register predictions in the space you MEASURE, not the space you model

`.337` registered two interpolation models **29 % apart in parameter space** and treated that as a decisive
test. In the space actually measured — the traced ceiling in counts — they were **5.1 counts apart** against a
class-B arm-to-arm spread of **2.3 counts**. A single class-B arm could not have separated them, and at ~6 runs
per class-B arm that would have been an expensive discovery.

Before committing to a discriminating measurement, push the competing predictions **through the instrument** and
check the observable separation exceeds the reproducibility. Parameter-space distance is not evidence.

## The patch `sd` is spatial variation, NOT the uncertainty of the mean

Rounds `.332` onward quoted lines like "2.1 counts against sd 3.4" as if `sd` bounded the measurement. It does
not: `patch-read.mjs`'s `sd` is the spread of pixel luminance **across** the patch — texture, shading gradients,
plank joints — and a large patch can have a large `sd` and a highly reproducible mean.

The correct uncertainty for comparing two arms is **arm-to-arm reproducibility within a (u) class**:

| | spread |
| --- | --- |
| class A, same boot and across boots | **0.0–0.1 counts** |
| class B, same boot (NW3/NW4: 178.4 vs 176.1) | **2.3 counts** |

Use ~2.3 counts for class-B comparisons. `.332`'s "slate ≈ ink" (2.1 counts apart) survives on this basis, but
it was originally justified with the wrong number.

## Compute discrimination power BEFORE choosing where to measure

`.338` extended `.337`'s lesson from "check the predictions are separable" to "choose the measurement point that
separates them best". Push every candidate form through the instrument across the available options and rank by
observable separation over reproducibility:

| finish | rho | prop+floor | chord | power law | separation |
| --- | --- | --- | --- | --- | --- |
| oat | 0.617 | 2.04 | 2.33 | 2.20 | 1.5σ |
| stone-grey | 0.382 | 1.26 | 1.80 | 1.50 | 2.7σ |
| **clay** | **0.296** | **0.98** | **1.60** | **1.22** | **3.7σ** |
| olive | 0.188 | 0.90 | 1.35 | 0.85 | 3.5σ |

Instinct said "add a point higher up the curve" (oat). That would have been the **weakest** available test. The
discriminating region is where the candidates diverge, which here is where one model's floor engages — nowhere
near the endpoints.

**And the same calculation tells you when to STOP.** Once the chord was refuted, the two surviving forms
differed by ≤0.24 GB — about 1.4σ per arm, needing ~3 class-B arms (~18 runs at a 6× (u) tax) — while agreeing
closely enough that the choice is immaterial. So the curve is finished *to this instrument's power*. Stopping by
calculation is better than stopping by exhaustion, and it is reportable: "further points cannot discriminate" is
a result, not a gap.

## `PTWANT=A|B` — get the (u) class you need in one run instead of six

(u)'s class is decided per `createHqRenderSession` call and then followed deterministically (`.330`, `.334`).
Two facts make retrying cheap, both found by trying rather than assuming:

- **The trace converges in ~12 s.** Almost all of a run's ~4 minutes is page boot and settling, so replacing a
  wrong-class arm costs ~20 s rather than a fresh run.
- **There is NO Re-render button during a render.** It appears only after convergence — which is why `PT2` can
  use it. The first cut of this knob tried to abandon mid-render and logged twelve consecutive failed attempts.
  The retry must run **after** the settle.

The class is readable at **9 samples**: on the existing 10 % poll patch (`patchStatsFn`), bedroom3
`WALKFOV=72` `PITCH=-0.02` under the shipped gradient reads **~163 in class A** and **~74 in class B**, stable
to ±0.3 counts from 8 through 59 samples. `PTCLASS_THRESH=150` separates them amply.

**The threshold is pose- and environment-dependent and must be supplied** — `.326` (a discriminator calibrated
under one environment does not transfer) and `.330` (nor across a pose change). Re-derive it whenever either
changes: run once without `PTWANT` and read the patch L for each class.

Validated against a known result: asked for class B at stone-grey, got it at 9 samples, converged arm read
ceiling 96.7 / wall 67.8 against `.337`'s 96.7 / 67.7.

## Daytime class-B reproducibility is ~0.1 counts, NOT 2.3

`.337` and `.338` quoted a class-B arm-to-arm spread of **2.3 counts**, taken from NW3/NW4 — a **night** pair,
where the lamp's gradient inflates spatial variance across the ceiling patch.

Two independent **daytime** class-B arms of the same condition agree to **0.1 counts** (96.7/96.7 ceiling,
67.7/67.8 wall). So for daytime comparisons the 2.3-count figure is roughly **20× too pessimistic**, and
`.338`'s conclusion that "the curve is finished to the instrument's power" was unsound — with the correct noise,
the surviving closed form was refutable, and `.339` refuted it.

| condition | class-B arm-to-arm spread |
| --- | --- |
| daytime, hour 13 | **~0.1 counts** |
| night, hour 21 (lamp gradient) | ~2.3 counts |

Quote the figure for the condition you are actually in, and measure it rather than carrying it across.

## Any result inconsistent with the intervention's plausible magnitude — in either direction

Sharper than the "too good to be true" form, and adopted from dev-1a, who proved it against their own bug: a
regex rescaled **13** coordinate literals instead of 46, and a *too-low* count was exactly as diagnostic as a
too-high one would have been.

This arc's instances:

| round | signal | plausible? |
| --- | --- | --- |
| `.327` | +38.7 counts in the predicted direction | the intervention had not fired |
| `.339` | **twelve** consecutive failed retries | no such control existed |
| `.340` | a silent bail returning a plausible arm | wrong (u) class, caught only by the R−B check |

So the check is **"does the magnitude match what I actually did"**, not "is this suspiciously favourable". A
count that is implausible in either direction is the cheapest available verification, and it is available
before any analysis.

## PTWANT's classifier rect is pose-dependent — the sign rule is not enough

`PTCLASS_MODE=rb` classifies on the SIGN of R−B, which removes the need for a per-pose *threshold* (`.326`,
`.330`). But it still reads the fixed 10 % poll patch at (0.45, 0.18), and that lands on clean ceiling only in
some poses:

| pose | poll-patch R−B, class A | proper ceiling patch |
| --- | --- | --- |
| bedroom3 `WALKFOV=72 PITCH=-0.02` | ~−12 | −13.8 |
| **livingDining, same** | **−0.7** | **−11.0** |

At livingDining the margin nearly vanishes, so the call becomes unreliable even though the rule is sound. **The
discriminator's margin is pose-dependent even when its sign rule is not.** Verify the margin at any new pose —
run once with `PT2=1` and read R−B on both the poll patch and the patch you intend to measure — before trusting
`PTWANT` there.

## `${var:+NAME=value}` is not an assignment prefix in zsh

`.340` lost three runs to `exit=127`. zsh decides which words are assignments **before** expansion, so
`${w:+WALL=$w} node script.mjs` makes the expanded text the *command name*. Pass the variable unconditionally
instead — `WALL="$w"` — which this probe already treats as unset when empty.

Note the compounding error: the first fix (an absolute script path) addressed a plausible cause that had not
been verified. `127` means "command not found", which named the real problem immediately once read.

## Re-render gives ONE extra arm per boot, not repeated sampling

`.341` built `PTCENSUS=<n>` to sample n+1 (u) arms in one boot, on the reasoning that Re-render creates a fresh
session at ~25 s against ~7 min for a boot. It stopped after **2 arms** every time: `Re-render unavailable after
arm 1`.

So the button is available once after the first convergence and not again. That is exactly what `PT2` has always
used, and it is the bound: **one extra arm per boot.** Repeated in-boot sampling needs a different mechanism
(closing and reopening the modal, or a page reload), which has not been built.

Consequence worth remembering: **(u)'s class rate has never been measured.** Every figure quoted in this arc
("~50 % class A", "42 % class B", `.337`'s 6× tax, `.340`'s p(A) ≈ 0.75) comes from arms that accumulated while
measuring something else — and those rounds stopped as soon as they got the class they needed, which truncates
the sequence on a class-B arm and biases the estimate. Treat all of them as anecdote.

## A clean way to refute your own correlate: re-run the same condition on a fresh boot

`.340` observed livingDining splitting cleanly by wall finish (white B/B, ink A/A/A/A) and flagged it as a
possible first correlate for (u). `.341` re-ran both conditions and got the **exact inversion** (white A/A, ink
B/B), confirmed against the converged frames.

One re-run of the same condition on a fresh boot is the cheapest possible test of any claimed correlate here,
and it should precede any deeper investigation. The cost is one boot; the alternative is building a theory on a
2 % coincidence.

## The R−B sign rule has a hidden premise: warm fixtures. It FAILS under LIGHTS=off

`.325`'s discriminator classifies on the sign of R−B, on the basis that class A carries the environment's cool
cast while class B carries the room's warm bounce. The second half is a **premise, not a fact**: the room's
bounce is warm only because tungsten fixtures are on.

`.342`, `LIGHTS=off` at livingDining: an arm read **L=129.5, R−B −1.6**. The sign rule called it class A; it is
class B, 37 counts below the class-A cluster (166–168). With daylight alone the room's bounce is cool too, so
the sign carries no information.

**Under `LIGHTS=off`, classify on luminance.** Class A sits at the environment's level and is insensitive to
fixtures (measured 167.9 / 167.6 / 166.1 lights-off against 169.0 / 166.4 / 166.8 lights-on), so the class-A
level from a lights-on run transfers; the class-B level does not.

Fourth variant of one error, worth reading together:

| round | what failed to transfer |
| --- | --- |
| `.326` | a threshold, across environments |
| `.330` | a threshold, across poses |
| `.340` | the classifier's **rect**, across poses (rule still sound) |
| `.342` | the **rule's premise**, across a lighting change |

## Two signals help only when their CAUSES differ

`.327` concluded that two signals give no protection when a single confound drives both — luminance and hue both
moved, both as predicted, on an intervention that had not fired.

`.342` is the complement: luminance and R−B **disagreed**, and that disagreement was diagnostic, because their
causes are independent — chroma follows the light source's colour, luminance follows whether the ceiling is a
rendered surface. So the useful test is not "do I have two numbers" but **"can one fault move both?"** If yes,
they are one signal wearing two hats.

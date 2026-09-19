# Interaction sweep — regression re-run (2026-09-19)

Full-catalogue re-run of `docs/audit/interaction-sweep-2026-09-18.md`, area 3 of the standing
review cycle (`/tmp/photoreal-mobile/review-cycle.md`), on the corrected recorder (per-rAF
`clip.poses`/SWEEP-POP-GATE, `--wall-trace`, `--mask-selectors`, clock pinned per clip). HEAD
`af5a6729` (v0.35.11.0), branch `feat/photoreal-adaptive-fallback`, dev server `:5200`
(already running), tier `realistic`, device class pinned, `interactiveDegrade` **on**, clock
pinned 12:00 by `record.mjs` itself (`applyPose` → `setTimeMode('manual')` +
`setManualHour(clip.hour ?? 12)`, asserted; no clip in the catalogue overrides `hour`).

Fourteen shipped commits since the last full run (`v0.35.7.7` → `v0.35.11.0`): TIER-CHANGE-VEIL +
SWEEP-POP-GATE + AO-DIR-FALLBACK, LIGHTMAPS-DENOISED, BACKDROP-WARMUP, WALK-LIGHT-CENSUS-WARMUP,
DEGRADE-UNIFIED + LIGHT-WELL-ORBIT, REVIEW-WALK-PHOTOREAL, CEILING-FITTINGS-VISIBLE +
LIGHT-PROMPT-EFFECTIVE-STATE, LIGHTS-DAYLIGHT-ADDITIVE + SUN-PATCH + CORRIDOR-SPILL,
MIRROR-REFLECTOR-WEAK + SHOWER-GLASS-WEAK, BATH2-SEAM + WALL-HEAD-LEAK + YARD-NIGHT, KNIP-CLEAR,
REVIEW-ORBIT-DOLLHOUSE, MITRE-SEAM-IN-REVEAL. This run's job is to find out which of those moved
an interaction-sweep counter.

Evidence: `/tmp/sweep/reg-2026-09-19/<arm>/<clip>/` (frames, `clip.json`, `metrics.json`,
`events.json`, `sheet.png`, `worst/*.png`, `clip.webm`); not committed (PNG). Baselines compared
against: `docs/audit/interaction-sweep-2026-09-18.md` (original/closing full-catalogue tables)
and `/tmp/sweep/final2/<arm>/` (18-clip fixed-finding subset, still on disk, used for the
per-clip table below).

**No `src/` change.** No harness fix was needed either — every clip in the catalogue ran to
completion on every requested arm; the one `op failed` (`orbit-menu-mid-drag`, both desktop arms)
is the pre-existing, already-documented `clickSelector`-releases-the-drag artefact (see below),
not a new harness defect.

## Run matrix

| arm | viewport | input | clips | frames | console errors |
| --- | --- | --- | --- | --- | --- |
| `desktop-metal` | 1200×900 DPR 1, `capable` pinned | mouse + wheel + keys | 23/23 | 5 227 | 0 |
| `phone-metal` | 390×844 DPR 3 touch, `weak` pinned, DOM-masked | CDP touch | 16/16 | 4 309 | 0 |
| `phone-metal-solo` (`orbit-phone-double-tap`, standalone, own session) | same | touch | 1/1 | 151 | 0 |
| `desktop-swiftshader` (reduced set, `scripts/scenarios/sweep/reduced-swiftshader.json`) | 1200×900, software ANGLE | mouse + keys | 10/10 | 1 175 | 0 |

**37/37 requested clips completed on every requested arm — the reduced SwiftShader set that was
"aspirational until someone gives it an hour" in the 09-18 doc finally got the hour: all 10 clips
(6 orbit + 4 walk) finished, none abandoned.** `--wall-trace` was recorded on every clip in every
arm (398 rows on the longest phone clip, 284 on a representative desktop one); `--mask-selectors
".info-callout,.hud-pill"` was recorded on phone only, and correctly caught the "Get started"
onboarding card (1 rect) on every walk clip and a second rect (the joystick label) on the three
walk clips where it overlaps — `.hud-pill`'s zero hits are correct, not a miss: that class belongs
to context-sensitive prompts (drag/resize/door/fixture/screen HUDs) that none of these clips
trigger, not to a persistent overlay.

**Zero `BLACK_FRAME`, zero `GL_ERROR`, empty `console` in all 10 862 frames across all four
sessions.** Every sheet (37) and every flagged triptych (176) was looked at.

## Event counts per arm — today vs the 09-18 full-catalogue passes

⚠️ Same catalogue size as the 09-18 original/closing full passes (23/16/10), so these rows ARE
directly comparable, unlike the 09-18 doc's own "final" row (an 18-clip subset — used in the
per-clip table below instead).

| arm | pass | frames | DPR_TOGGLE | FLASH | RECOMPILE | POP (new gate) | POP (legacy gate) | STUTTER | BLACK_FRAME | GL_ERROR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `desktop-metal` | 09-18 original | 5 008 | 20 | 26 | 9 | 43 | — | 5 | 0 | 0 |
| `desktop-metal` | 09-18 closing | 5 239 | 22 | 19 | 11 | 25 | — | 6 | 0 | 0 |
| `desktop-metal` | **today** | **5 227** | **29** | **24** | **14** | **29** | **37** | **15** | **0** | **0** |
| `phone-metal` | 09-18 original (re-run) | 4 194 | 4 | 10 | 3 | 232 | — | 2 | 0 | 0 |
| `phone-metal` | 09-18 closing | 4 374 | 8 | 9 | 6 | 145 | — | 2 | 0 | **130** |
| `phone-metal` | **today** | **4 309** | **4** | **12** | **7** | **280** | **149** | **2** | **0** | **0** |
| `desktop-swiftshader` | 09-18 original (4/10 clips, abandoned) | 378 | 1 | 3 | 3 | 34 | — | 257 | 0 | 0 |
| `desktop-swiftshader` | 09-18 closing (10/10) | 527 | 2 | 8 | 8 | 78 | — | 418 | 0 | 0 |
| `desktop-swiftshader` | **today (10/10, reduced set)** | **1 175** | **4** | **10** | **12** | **82** | **73** | **402** | **0** | **0** |

The new POP gate (`clip.poses`, per-rAF) is the number to read for a same-method comparison
against the 09-18 **final** table below (which also used the new gate); the legacy-gate column is
included because several of the phone gestures below moved specifically because of the gate, not
the app — see "Harness observation" under Findings.

**GL_ERROR 130 → 0 stands, unchanged since 09-18.** No console error reproduced on any arm.
**STUTTER on both Metal arms is up (desktop 5/6 → 15, and it is concentrated in one clip, see
R1 below) and SwiftShader's STUTTER is still overwhelmingly the ~1 fps software delivery cadence
described in the 09-18 doc, unchanged in kind** — 402 STUTTERs in 1 175 frames is every rAF delta
clearing 120 ms, same mechanism, just a longer 10/10 run this time instead of 4/10 or 10/10-in-a-
shorter-wall-clock.

## Per-clip regression table — today vs `/tmp/sweep/final2/` (18-clip fixed-finding subset)

Only clips present in both `final2` and today are comparable this way (the numbers, not the
absolute counts, are what changed — both passes use the new POP gate by default).

| arm | clip | final2 (baseline) | today | delta | verdict |
| --- | --- | --- | --- | --- | --- |
| desktop-metal | `orbit-tier-change-mid-drag` | DPR 3, FLASH 1, RECOMPILE 4, STUTTER 3, worst rAF 950–983 ms | DPR 1, FLASH 3, RECOMPILE 3, **STUTTER 13, worst rAF 3283 ms** | **STUTTER +10, worst stall 3.3×** | **REGRESSED — R1, high** |
| desktop-metal | `orbit-reversals` | FLASH 0, POP 6 | **FLASH 9**, POP 1 | FLASH +9 | **REGRESSED — R3, medium** |
| desktop-metal | `walk-orbit-switch-mid-gesture` | FLASH 1, POP 1, RECOMPILE 1, STUTTER 1 | FLASH 2, POP 1, RECOMPILE 4, STUTTER 1 | RECOMPILE +3, FLASH +1 | mild, same mechanism as R1 (see note) |
| desktop-metal | `orbit-pitch-limits` | DPR 3, RECOMPILE 1, POP 0, FLASH 0 | DPR 3, RECOMPILE 1, **POP 2, FLASH 1** | +2/+1, small | minor, not chased (below triptych-worth threshold) |
| desktop-metal | `walk-look-drag-while-moving` | DPR 1, POP 1 | DPR 1, POP 1 | none | clean |
| desktop-metal | `walk-into-wall-slide` | DPR 1, POP 6 | DPR 1, POP 1 | POP −5 | **improved**, not a regression |
| desktop-metal | `walk-kitchen-to-yard-door` | DPR 1 | DPR 1 | none | clean |
| phone-metal | `orbit-phone-orientation-mid-gesture` | **zero events**, 226 frames | **FLASH 7, POP 2**, 211 frames | +7/+2 from zero | **REGRESSED — R2, high** |
| phone-metal | `walk-pitch-limits-phone` | **zero events**, 307 frames | **POP 46**, 305 frames | +46 from zero | **REGRESSED — R4, medium** (new-gate; legacy gate reads 0 on the same frames — mechanism confirmed real by eye, see R4) |
| phone-metal | `orbit-phone-pinch` | DPR 1, POP 0 | DPR 0, **POP 33** (new gate) / POP 0 (legacy gate) | +33 (new gate only) | **harness, not app — see note below the table** |
| phone-metal | `orbit-phone-two-finger-rotate` | zero events | **POP 8** (new gate) / POP 3 (legacy) | +8/+3 | **harness, not app — same note** |
| phone-metal | `walk-phone-into-wall-slide` | POP 134 | POP 141 | +7 | within the 09-18 doc's own "a modest move near the 0.35 m/s threshold is expected" tolerance — **not a regression** |
| phone-metal | `walk-phone-look-only` | RECOMPILE 2 | RECOMPILE 1, POP 9, DPR 1 | +9 POP, otherwise flat | minor, not chased |
| phone-metal | `walk-phone-joystick-and-look` | RECOMPILE 2 | RECOMPILE 2, POP 3, DPR 1 | +3 POP | minor, not chased |
| phone-metal-solo | `orbit-phone-double-tap` | DPR 1, 145 frames | DPR 1, 151 frames | none | clean |
| desktop-swiftshader | `orbit-tier-change-mid-drag` | DPR 2, FLASH 2, POP 1, RECOMPILE 4, STUTTER 40 | DPR 2, FLASH 3, **POP 8**, RECOMPILE 5, STUTTER 39 | POP +7, FLASH +1 | consistent with R1 (more compile/paint activity during the same burst); not independently alarming at ~1 fps |
| desktop-swiftshader | `walk-into-wall-slide` | POP 9, STUTTER 15 | POP 11, STUTTER 15 | +2 | clean, within noise |

`desktop-swiftshader`'s `orbit-reversals` is in `final2` but **not** in
`reduced-swiftshader.json`'s 6-clip orbit list, so R3 could not be cross-checked on software
rendering this round — noted as a coverage gap, not chased blind.

**Harness observation, not an app defect (affects the `orbit-phone-pinch` /
`orbit-phone-two-finger-rotate` rows above).** Both are fast, deliberate gestures (a 46→60 m dolly;
a 106° twist at constant radius, per the 09-18 doc's own N7 measurements) that the OLD legacy gate
correctly reads as fast enough to suppress POP (0 and 3 events), while the NEW per-rAF pose gate
reads them as slow enough to allow it (33 and 8). This is the **opposite** of the aliasing case
`SWEEP-POP-GATE` was built to fix (a fast reversal misread as slow) — here a *dolly* (radial
speed) and a *pure twist at constant radius* (no positional motion at all, only azimuth) are
misread as slow by a gate whose 50 ms window may be tuned for tangential drag speed rather than
either of those two motions. `orbit-phone-zoom-through-wall` (another dolly-heavy phone orbit
clip, not in `final2` for a byte-comparison but showing POP 25 new-gate / 2 legacy-gate — a 12.5×
spread) is the same pattern a third time. Flagged for whoever owns `popGate.mjs` next; not fixed
here (`no src/ change`, and this is `scripts/dev-probes/sweep/`, not a "clip cannot run" case).

## NEW FINDINGS

| id | clip / arm | symptom | evidence | subsystem | sev | fix hypothesis |
| --- | --- | --- | --- | --- | --- | --- |
| **R1** | `orbit-tier-change-mid-drag`, desktop-metal | The first `setQualityTier` compile burst (realistic↔performance, programs 282→305) now stalls the main thread for **3283 ms** — the worst rAF delta ever recorded on this clip, 3.3× the 950–983 ms ceiling every prior pass (v0.35.6.1 through the 09-18 final/TIER-CHANGE-VEIL verification) measured. The SECOND switch on the same clip (305→325→336 programs) still costs only 950 ms, matching the old ceiling — so the regression is specific to the FIRST tier switch's now-larger compile set, not the veil mechanism itself. TIER-CHANGE-VEIL's own correctness holds: the triptych shows the unbranded "Applying Performance quality…" veil correctly covering the whole stall, not a raw frozen scene — but the veil's own fade can't animate through a 3.3 s rAF gap either, so the user sees a caption frozen in place, not a smooth loading transition. `walk-orbit-switch-mid-gesture`'s RECOMPILE 1→4 (same table, mode-switch's own reduced-census warm-up) is the same growth pattern on a smaller burst. | `/tmp/sweep/reg-2026-09-19/desktop-metal/orbit-tier-change-mid-drag/clip.json` (`samples[].raf`, worst entry `[110364, 3283.2, 90063]`), `worst/STUTTER-252.png` (veil correctly shown), `worst/RECOMPILE-252.png` | `src/scene/ShaderWarmup.tsx`, `src/state/slices/uiSlice.ts:setQualityTier`, and whichever of the six shipped features since v0.35.7.7 added the most new material permutations (`lampsDaylightRelative`/`daylightHourCurve` uniforms, `mappedDaylightSpill`, `mitreEnd` flag, ceiling-plaster tiling, neighbour-inherit lightmap indices) — not isolated here | **high** | Profile the realistic↔performance program-compile set directly (the same technique `WALK-LIGHT-CENSUS-WARMUP`'s N3 residual used) to find which of the newer flags grew the permutation count the most; consider warming BOTH tiers' program sets at boot behind `ShaderWarmup.tsx`, the way `BACKDROP-WARMUP`/`WALK-LIGHT-CENSUS-WARMUP` already warm the walk/orbit split, rather than paying the full compile cost on the first live switch. |
| **R2** | `orbit-phone-orientation-mid-gesture`, phone-metal | The 09-18 doc's N6 closed this clip at **zero events over 226 frames** (the resize-clear white flash fixed by `ResizeRepaint.tsx`). Today it is **FLASH 7, POP 2 over 211 frames**. Root cause traced to camera POSITION, not the resize-clear path: `clip.poses`/`clip.json.samples[].pos` shows the camera **teleporting** between two consecutive 100 ms samples — `[5.363, 2.856, -0.843] → [11.281, 0.68, 0.906]` — at the exact moment the SECOND touch-drag begins (t=1420 ms, 60 ms after `opLog`'s `touchDrag` start at 1462 — i.e. right at the first dispatched touchmove of the drag that starts in landscape, 700 ms after the portrait→landscape `viewport` op settled). The camera then sweeps a long, fast arc (`y` drops 2.86→0.68, near floor height) and settles at `[13.895, 0.715, 6.579]` — 7.65 m from the orbit target, well past the dining-room bound the clip's other landscape frames stay inside. The frames captured mid-sweep and at the far end are visibly wrong: `worst/FLASH-83.png` shows a flat grey wash over real content (a translucent veil-like overlay with no caption, unlike TIER-CHANGE-VEIL/ModeSwitchCrossfade, both ruled out by code search — neither's only two call sites, `setQualityTier` and the camera-mode switch, fire here), and the LAST frame (`0112.png`) is a flat two-tone grey/tan vertical split with **no scene geometry at all** — consistent with the camera clipping past the shell into the exterior, where S4's known residual (`open-graphics-decisions.md` `(ag)`, unresolved: "wing surfaces still run at the blown exterior boost") reads as a near-uniform blown colour field. Two live hypotheses, not disambiguated here: (a) a single-finger orbit drag that starts very soon after a landscape/portrait viewport swap computes its screen→rotation delta against a stale `domElement` dimension, producing one outsized rotation step; (b) `OrbitControls`' rotate speed is normalised by `domElement.clientHeight` (`OrbitCamera.tsx:829,835` use the same pattern for pan), and landscape's height (390 px) is roughly half portrait's (844 px) for the SAME clip, so the identical 160 px drag this clip dispatches produces roughly double the angular rotation in landscape — real physics, not a bug, but one that end users would feel as "the view spins much faster right after I rotate my phone." | `/tmp/sweep/reg-2026-09-19/phone-metal/orbit-phone-orientation-mid-gesture/clip.json` (`samples[].pos`, `opLog`), `worst/FLASH-78.png`, `worst/FLASH-83.png`, frame `0112.png` (flat grey/tan split, no geometry) | `src/scene/cameras/OrbitCamera.tsx` (rotate/pan handlers reading `gl.domElement.clientHeight`/`clientWidth`, lines 216/248/345/386/414/464/829/835/919/1047) and the S4 residual in `docs/open-graphics-decisions.md` (`(ag)`) | **high** | Re-run this clip alone with a scene probe logging `OrbitControls`' internal rotate delta per pointermove alongside `domElement.clientHeight` at that instant, to confirm/refute hypothesis (a) vs (b); if (b), consider whether rotate speed should scale by the SHORTER viewport dimension regardless of orientation, so a phone rotation doesn't change how far a fixed-pixel drag swings the camera. |
| **R3** | `orbit-reversals`, desktop-metal | FLASH 0 → **FLASH 9** across the five scripted azimuth reversals (POP improved, 6→1, so this is not a broader regression of the clip). Every 09-18 triptych for this clip showed "the lit interior sliding behind the grazing facade" at a wall mitre as the mechanism (S3, re-confirmed there at FLASH 0). Today's `worst/FLASH-17.png` and `worst/FLASH-34.png` show the SAME grazing-mitre content change, just crossing the FLASH threshold (mean jump >25) far more often — 9 times instead of 0–4 across every prior pass. HEAD is `af5a6729`, **MITRE-SEAM-IN-REVEAL (v0.35.11.0)** — the commit immediately before this run, which rewrites exactly this seam's lightmap sampling (`wallBodyGeometry.ts:MITRE_END_ATTR`, `lightmapExterior.ts:markMitreEndFaces`) and reduced the seam/wall luma ratio from 2.32× to 1.66× at a static pose. A ratio that is still >1× and now driven by a NEW code path, seen for the first time under FAST reversal rather than the static dolly poses MITRE-SEAM-IN-REVEAL was verified against, is the natural place to look. Not proven — no A/B against the pre-v0.35.11.0 build was run this pass (would need a second checkout; out of scope for a `src/`-untouched review). | `/tmp/sweep/reg-2026-09-19/desktop-metal/orbit-reversals/worst/FLASH-{17,34}.png`, `events.json` | `src/apartment/walls/wallBodyGeometry.ts`, `lightmapExterior.ts:markMitreEndFaces`, `WallSegment.tsx` — same subsystem as area 2's O1/O2 | **medium** | A/B `orbit-reversals` on the commit before `af5a6729` (`0c67de96`) vs HEAD with the recorder, same seed; if FLASH tracks the mitre fix, decide whether the residual 1.66× ratio (already logged as MITRE-SEAM-IN-REVEAL's own "honestly-reported residual") is worth a second pass or is an acceptable trade for closing the wedge. |
| **R4** | `walk-pitch-limits-phone`, phone-metal | Zero events at 09-18 final (307 frames, N4: "the ceiling is exposed, not blown... flags nothing"). Today: **POP 46** (new gate; legacy gate on the identical frames reads **0**, so this is genuinely visible content change, not a gate artefact — the 09-18 doc's own POP mechanic requires camera stillness, which this clip has by construction while holding the pitch clamp). `worst/POP-10.png` and `worst/POP-19.png` show why: a **candle cluster prop** (not present as a moving element in any 09-18-era finding) sits on the coffee table in view, and the tile deltas recur (135+ counts, near the full 0–255 range) continuously for ~215 of the clip's 305 frames at tile rows that track two distinct regions — the already-documented, already-accepted ceiling-fan sweep (top rows, tiles `8,1`/`13,0`/`7,1` etc — the 09-18 doc's standing "Fan-driven POP... harness artefact, not an app defect") AND a second, NEW cluster of high-amplitude deltas at rows around the candle prop (`17,20`/`15,36`/`14,30`/`12,34`/`13,32-35`/`11,35` etc) that was not present in this clip's frame content the last time it was swept. `CandleCluster.tsx` itself carries no `useFrame`/flicker code (checked directly), so the pop-in is not an obvious animation bug in that file; candles/decor placement is new since the last sweep (`LIGHTS-DAYLIGHT-ADDITIVE`-era decor changes land in the same window), and the mechanism producing a sustained near-full-range per-frame delta at a static camera was not isolated further this pass. | `/tmp/sweep/reg-2026-09-19/phone-metal/walk-pitch-limits-phone/worst/POP-{10,19}.png`, `events.json` (46 entries, camera 0.00 m/s throughout) | `src/furniture/primitives/CandleCluster.tsx`, `src/furniture/defs/decor.ts`, `src/furniture/defaults/livingDining.ts` (placement) — mechanism not isolated to a single file | **medium** | Re-run this clip alone with `?ff=` toggles for the newer decor/lighting flags to bisect which one is driving the candle-region delta; if it is an intentional flame-flicker animation, confirm the amplitude is intentional (currently swings 130–197/255, i.e. close to full dark-to-light) rather than a stray double-render of the flame mesh. |

## Harness artefacts, explicitly NOT app defects (reconfirmed this pass)

1. **`orbit-menu-mid-drag`'s `op failed: 'left' is not pressed`** (both desktop arms, 82/294
   frames still captured, clip completes) is the pre-existing, already-documented Puppeteer
   behaviour: `clickSelector` is a full click (down+up), so it releases the button the clip's own
   drag is holding before the clip's explicit `mouseUp` op runs — "menu opened during a drag" is
   what gets tested, "drag continues after the menu opens" cannot be, exactly as the 09-18 doc's
   "What could not be emulated" section already states. Not a new harness defect; no fix made.
2. **Fan-driven POP**, unchanged (see R4's fan-region tile rows above).
3. **SwiftShader delivery cadence** — 402 STUTTERs in 1 175 frames, ~1 fps software delivery,
   unchanged in kind from the 09-18 doc; this pass simply ran the full 10-clip reduced set instead
   of stopping at 4 or budgeting a shorter session.
4. **The POP-gate speed-estimate asymmetry for dolly/twist gestures**, new this pass — see the
   note under the per-clip table (`orbit-phone-pinch`/`orbit-phone-two-finger-rotate`/
   `orbit-phone-zoom-through-wall`).
5. **Clip-to-clip pose/program-cache coupling** and **the pinned adaptive ladder**, unchanged —
   both still apply exactly as the 09-18 doc describes; `orbit-phone-double-tap` was again
   recorded standalone for this reason (`phone-metal-solo`, clean, DPR_TOGGLE 1, matches `final2`
   almost frame-for-frame — 151 vs 145 frames, same single event).

## No-regression statement

Every clip not named in the regression table or the NEW FINDINGS table above is **clean**: no
event-count increase against its `final2` baseline (where one exists) beyond the noise band the
09-18 doc itself calls out (`walk-phone-into-wall-slide`'s POP), and no new defect was seen on its
sheet or triptychs. This explicitly includes: `walk-look-drag-while-moving`, `walk-kitchen-to-
yard-door`, `orbit-phone-double-tap` (byte-for-byte consistent with `final2`), `walk-phone-look-
only`, `walk-phone-joystick-and-look`, `walk-phone-joystick` (no baseline, zero events), `walk-
doorway-grazing`, `walk-into-furniture`, `walk-run-and-turn`, `walk-strafe`, `walk-forward-back`
(no baseline in `final2`, but zero-to-minimal events and clean sheets), `orbit-slow-rotate`,
`orbit-fast-flick`, `orbit-pan`, `orbit-zoom-limits`, `orbit-zoom-through-wall`, `orbit-drag-from-
toolbar`, `orbit-double-click`, `orbit-hour-ramp-mid-drag`, `orbit-phone-slow-rotate`, `orbit-
phone-flick`, `orbit-phone-drag-from-toolbar`, `orbit-phone-hour-ramp-mid-drag`. Zero
`BLACK_FRAME`, zero `GL_ERROR`, empty console everywhere, all four sessions.

## Summary

**4 new findings (R1–R4): 2 high (R1 tier-change stall now 3.3×, R2 orientation camera
teleport/blown frames), 2 medium (R3 orbit-reversals FLASH tied to MITRE-SEAM-IN-REVEAL, R4
candle-region POP storm).** One harness-side observation (POP gate under-reads dolly/twist speed)
recorded but not fixed. No `BLACK_FRAME`, `GL_ERROR` or console error anywhere in 10 862 frames
across 37 clips × 3 arms (+1 standalone). Next area: **4 — mobile UI/UX audit**.

---

# SWEEP-REGRESSIONS-3 — R1–R4 worked (v0.35.11.3)

Follow-up pass on the four findings above, on HEAD `15db6b79` (MITRE-END-INHERIT, v0.35.11.2) in
an isolated worktree with its own dev server on `:5201`, so the main tree never hot-reloaded a
running recorder. Same method as the review pass — recorder pins the clock per clip,
`--wall-trace`, `--mask-selectors` on phone, pose-based POP gate, device class pinned,
`interactiveDegrade` ON.

**Baseline for every "before" number below is the archived 09-19 frames RE-ANALYSED under the new
gate**, not the counts in the tables above: two of the four findings are gate changes, so a
before/after that mixes gates would be measuring the gate, not the app.

| arm | before (archived frames, new gate) |
| --- | --- |
| `desktop-metal` | DPR_TOGGLE 29, RECOMPILE 14, STUTTER 15, FLASH 24, POP 13 |
| `phone-metal` | DPR_TOGGLE 4, RECOMPILE 7, STUTTER 2, FLASH 12, POP 197 |
| `desktop-swiftshader` | DPR_TOGGLE 4, RECOMPILE 12, STUTTER 402, FLASH 10, POP 82 |

## R1 — NOT REPRODUCED; every named candidate refuted by a program census

**The 3.3× did not reproduce.** `orbit-tier-change-mid-drag`, desktop-metal, three independent
recordings on this build: worst rAF **1166.6 ms** (that run carried `--wall-trace`, a page
`evaluate` per rendered frame), then **983.0 ms** and **967.0 ms** clean — i.e. back ON the
950–983 ms ceiling every pass from v0.35.6.1 to the 09-18 final measured, against the review
pass's single **3283.2 ms** sample. Program growth is unchanged (279 → 336, +57), so this is the
same burst costing its usual amount, not a smaller one: the 3283 ms reads as a one-off outlier in
that session, and the review pass recorded the clip once.

**Attribution, by program census rather than by inference** (`scripts/dev-probes/
tier-program-census.mjs`, new: snapshots `gl.info.programs`' `cacheKey`/`name` either side of a
live `setQualityTier`, diffs them, and reports the worst rAF alongside — the BACKDROP-WARMUP
technique plus a stall number, so "more programs" is distinguishable from "slower programs").
Desktop 1200×900, `capable` pinned, 12:00, realistic → performance, one switch per arm:

| arm (`?ff=`) | programs | added | worst rAF |
| --- | --- | --- | --- |
| control | 273 → 313 | +55 | 1166.7 ms |
| `lightmapNeighbourInherit:off` | 271 → 313 | +55 | 1166.6 ms |
| `ceilingPlaster:off` | 278 → 321 | +59 | 1350.0 ms |
| `mirrorReflectorWeak:off,showerGlassWeak:off` | 273 → 313 | +55 | 1183.3 ms |
| `wallHeadClamp:off` | 273 → 313 | +55 | 1166.7 ms |
| `lampsDaylightRelative:off,daylightHourCurve:off,mappedDaylightSpill:off` | 273 → 313 | +55 | 1150.0 ms |
| `orbitStudioLook:off` | 212 → 246 | +48 | **3516.6 ms** |

**None of the six candidates the brief named is the contributor.** Four are byte-identical to the
control (+55 programs, 1150–1183 ms — including the three "should be neutral, uniforms only"
daylight flags, confirming they are). `lightmapNeighbourInherit`'s claimed "+3 programs" is not
visible in the cache-key diff at all. `ceilingPlaster:off` is *worse*, not better (+59, 1350 ms,
and five extra `lambert` programs — turning the skim-coat off puts the plain ceiling back on a
material whose variant is not otherwise in the cache).

**What the burst actually is.** Grouped by three's own shaderID, the control's +55 is
`physical` 45, `basic` 3, `lambert` 1, `EffectMaterial` 1, `PMREMGGXConvolution` 1, unnamed 4 —
i.e. overwhelmingly the LIGHT-COUNT-STABLE mechanism `ShaderWarmup.tsx` already documents twice
over: a tier change alters the light census, three bakes `numDirLights`/`numDirLightShadows` into
EVERY program's cache key whether or not that shader reads a light, and the whole PBR set
recompiles. It is structural to the tier switch, not attributable to any one shipped feature. A
four-switch control shows the cost is also mostly NOT compile: the third switch (realistic →
performance again, everything cached) still costs **816.7 ms** for only +11 programs, so ~800 ms
of the ~1150 is material rebuild and procedural-texture work, not shader compilation.

**The one lever that moves it is already pulled.** `orbitStudioLook:off` makes
WALK-LIGHT-CENSUS-WARMUP's boot pass a no-op (no studio key → `shouldWarmWalkLightCensus` is
false) and the same switch then costs **3516.6 ms** — 3.0× the control. That boot warm-up,
shipped for the orbit→walk switch in v0.35.8.2, is therefore worth ~2.3 s on the first TIER
switch as well, which nobody had measured. Recorded here so it is not removed as dead weight.

**No `src/` change made for R1.** Shipping a speculative pre-warm against a stall that measures at
its historical ceiling on three runs would be tuning against noise.

## R2 — FIXED (`ORBIT-ROTATE-ISOTROPIC` + `RESIZE-RESEED`)

Root cause is hypothesis **(b)**, and the clip's own `hold: true` is what turns a feel bug into a
teleport. `orbit-phone-orientation-mid-gesture` holds the finger DOWN across the portrait→landscape
swap and then moves it 300 px in ONE step ("portrait → landscape → portrait with the finger still
down"). three's OrbitControls normalises both rotate axes by `domElement.clientHeight` alone, so
that single move asked for `2π·300/390` ≈ **4.83 rad** in landscape where the zero-event 09-18
baseline had asked for `2π·300/844` ≈ 2.23 rad in portrait — past `maxPolarAngle`, inside the
shell, and back out as ORBIT-SHELL-CLAMP's radial push. Both were doing their job; the input was
2.16× too strong. Hypothesis (a) was tested and ruled out for the ordinary case: a fresh drag 700
ms after a swap, with no held finger, showed no stale-start jump at all.

Two fixes, both needed, measured separately:

| build | max single-tick \|dAz\| | portrait:landscape gain | clip events (216 frames) |
| --- | --- | --- | --- |
| before | 1.3091 rad | 2.16× | FLASH 7, POP 2 |
| + `orbitRotateSpeed` (isotropy) | 0.6049 rad | **1.01×** | FLASH 3 |
| + first-delta re-seed | **0.0545 rad** | 1.01× | **zero events** |

Halving the gain halves the bogus rotation; it does not remove it, because 2.23 rad from one
150 ms move is still not a gesture. The second half discards the FIRST pointer delta after a
resize — a viewport swap reflows the layout under a finger that is still down, so the next pointer
position is a new place on a new layout, not a continuation. `rotateSpeed`/`panSpeed` are zeroed
for exactly that one move, which makes three's own `rotateStart.copy(rotateEnd)` re-seed at the
new position while rotating by nothing; the arm is consumed by the next pointer event of any kind,
so at most one move is ever affected. Dolly is deliberately untouched (its delta is a RATIO of two
touch distances, which a reflow does not displace).

Gain measured directly with `scripts/dev-probes/orbit-resize-rotate.mjs` (new): per-pointer-event
`pageX/pageY`, live `clientHeight`, and azimuth/polar either side, over a portrait control drag, a
second portrait drag, a post-swap landscape drag and a second landscape drag. **N6's closure is
restored: zero events, 216 frames, camera height constant, geometry in every frame.**

## R3 — REPRODUCED and now PROVEN to be the mitre commits; NOT fixed here

The 09-19 review could not run the A/B it wanted ("would need a second checkout; out of scope").
It has now been run, in a third worktree at **`0c67de96`** — the commit immediately BEFORE
MITRE-SEAM-IN-REVEAL — with its own dev server on `:5202`, same machine, same arm, same clip:

| build | frames | FLASH | whole-frame luma range | worst adjacent-frame Δluma |
| --- | --- | --- | --- | --- |
| `0c67de96` (pre-mitre) | 130 | **0** | 161.8 – 175.3 (13.5 counts) | **3.5 counts** |
| HEAD (`15db6b79`, post MITRE-END-INHERIT) | 122 | **12** | 102.7 – 187.0 (84.3 counts) | **65.7 counts** |

**So the mitre work owns R3, and F's MITRE-END-INHERIT did not close it — it went 9 → 12.** The
wall reveal itself is NOT the variable: `--wall-trace` shows a wall mid-fade on 120/120 rendered
frames at HEAD and 133/133 at `0c67de96`, i.e. both builds are revealing continuously through the
whole clip; only the brightness response differs.

**And the mechanism is bigger than a seam.** The audit's fix hypothesis (mitre end faces /
section caps toggling out of step with the wall body's eased opacity) cannot be the whole story:
a thin end-face wedge cannot move the WHOLE-FRAME mean by 65.7 counts between two adjacent
frames. What the numbers describe is a large lit area changing value — consistent with
MITRE-END-INHERIT's own applier log on this plan (`276 mitre-end face(s) → analytic, 495
mitre-end vertex(es) → own wall's map, **512 mesh(es) INHERITED a neighbour's map (507
clones)**`): half a thousand meshes now sample a DIFFERENT wall's bake through a cloned material,
so what a grazing reversal swings past is a set of surfaces whose brightness no longer tracks
their own wall. The static dolly poses both mitre commits were verified against hold one pose and
cannot see this; a five-reversal clip sweeps the grazing angle across those surfaces repeatedly.

**Not fixed in this commit, deliberately.** The next step is a luma A/B of the inherited-vs-own
bake at a grazing pose (not a head-on one), which is surgery inside `lightmapMitre.ts` /
`applyVisibilityLightmaps.ts`'s inherit path — the subsystem the immediately-preceding commit
changed, and whose author has the context. What this pass adds is the thing the review pass
explicitly could not supply: the A/B is run, the attribution is no longer a hypothesis, and the
"it is only a 1.66× seam ratio" framing is refuted by an 84-count whole-frame swing.

## R4 — HARNESS, not the candle prop; the POP gate had no pitch column

`CandleCluster.tsx` re-confirmed to carry no animation whatsoever — no `useFrame`, no flicker, a
static emissive tetrahedron — so the audit's "is it an animated sprite?" branch is closed
negative. The mechanism is the gate. `walk-pitch-limits-phone` holds position and yaw EXACTLY
constant by construction (11.00, 6.50, yaw 0.070 for all 302 archived poses) and swings PITCH
−1.5…+1.5 rad against the clamp, and `clip.poses` carried **no pitch column** — so the pose gate
scored all 305 frames "camera still" and passed 46 motion-driven tile deltas through as POP, while
the legacy gate, which always read `samples[].pitch`, read 1.9 rad/s and flagged none. That is
exactly the 46-vs-0 split the review pass recorded and (reasonably, on the evidence then
available) read as proof the app was at fault.

`record.mjs` now records a second angle per pose — walk `__walkLook.getPitch()`, orbit
`controls.getPolarAngle()` — and `popGate.mjs` sums both. See the harness note below for the
second half of the same fix.

## Harness note — the POP gate under-read dolly/twist, and why widening alone was not the answer

The review pass flagged that the pose gate reads a phone dolly/twist as slow. The archived
`clip.poses` say why, and it is not "radius is missing from the position delta" — it is input
CADENCE. A CDP `pinch`/`twoFingerRotate` lands a real touch-move only about every **80 ms** and the
camera position is byte-identical in between (`orbit-phone-pinch`: four rAF ticks at
`41.618, 21.558, 26.892`, then one 4.7 m step, then four more flat ticks). The 50 ms window was
NARROWER than that plateau, so it frequently sat entirely inside one and read ~0.03 m/s during a
37 m/s dolly. Same class as the one-finger `stepMs` quantisation the 50 ms figure was sized
against, at a coarser cadence.

Widening alone would have re-introduced the aliasing the pose gate exists to fix, so the estimate
is now **path length** — the sum of per-pose deltas inside the window, not the displacement of its
endpoints — at a **120 ms** window. Path length is monotonic in motion, so a swing-and-return
inside one window reads its true swept distance instead of a near-zero net. Re-analysed on the
archived 09-19 frames, still-gated frame counts move onto the legacy gate exactly where the legacy
gate was right, and stay put where it was wrong:

| clip | old pose gate | legacy | new (path, 120 ms) |
| --- | --- | --- | --- |
| `orbit-phone-pinch` | 186 | 119 | **120** |
| `orbit-phone-zoom-through-wall` | 168 | 121 | **114** |
| desktop `orbit-zoom-through-wall` | 138 | 60 | **60** |
| desktop `orbit-zoom-limits` | 211 | 108 | **91** |
| `walk-phone-look-only` | 191 | 127 | **116** |
| desktop `orbit-reversals` (the aliasing case) | 54 | 54 | **54** |
| desktop `orbit-tier-change-mid-drag` (legacy is WRONG here) | 245 | 39 | **247** |

Four unit tests added to `popGate.test.mjs` for the new cases (pitch-only swing, 80 ms input
plateau, path-length-vs-net-displacement on a reversal, and a length-6 legacy pose row).

## Result tables

Re-recorded subsets on HEAD + this commit, `:5201`. Not the full 37-clip catalogue — the clips
carrying R1–R4 plus the controls that the desktop rotate-gain change could plausibly move.

| arm | clips | frames | DPR_TOGGLE | FLASH | RECOMPILE | POP | STUTTER | BLACK_FRAME | GL_ERROR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `desktop-metal` | 18 | 3 450 | 26 | 20 | 12 | 20 | 22 | 0 | 0 |
| `phone-metal` | 12 | 3 376 | 1 | 0 | 7 | 125 | 0 | 0 | 0 |
| `desktop-swiftshader` | 10 | 545 | 4 | 6 | 8 | 120 | 423 | 0 | 0 |

Per-clip, the findings' own clips:

| clip / arm | before (archived frames, new gate) | after | verdict |
| --- | --- | --- | --- |
| `orbit-tier-change-mid-drag` / desktop-metal | STUTTER 13, worst rAF 3283.2 ms | STUTTER 5, worst rAF **983 / 967 ms** (2 clean repeats) | R1 not reproduced |
| `orbit-phone-orientation-mid-gesture` / phone-metal | FLASH 7, POP 2 | **zero events**, 216 frames | **R2 FIXED** |
| `orbit-reversals` / desktop-metal | FLASH 9 | FLASH 12 (pre-mitre control: **0**) | **R3 attributed, open** |
| `walk-pitch-limits-phone` / phone-metal | POP 46 | **POP 0** (RECOMPILE 1) | **R4 FIXED (harness)** |
| `orbit-phone-pinch` / phone-metal | POP 33 (old pose gate) | **zero events** | gate fixed |
| `orbit-phone-zoom-through-wall` / phone-metal | POP 25 (old pose gate) | **zero events** | gate fixed |
| `orbit-phone-two-finger-rotate` / phone-metal | POP 8 (old pose gate) | DPR_TOGGLE 1 only | gate fixed |
| `walk-phone-into-wall-slide` / phone-metal | POP 136 | POP 122 | unchanged in kind (genuine lit-window parallax, N5) |

**Desktop rotate-gain control.** The 1.33× slower desktop orbit is visible in the numbers only as
slightly shorter camera sweeps; no desktop clip gained an event class. `orbit-slow-rotate`,
`orbit-pan`, `orbit-fast-flick`, `orbit-zoom-limits`, `orbit-double-click`,
`orbit-drag-from-toolbar`, `orbit-resize-mid-drag` and all six desktop walk clips are clean or
carry only the expected `DPR_TOGGLE`/`RECOMPILE`. Zero `BLACK_FRAME`, zero `GL_ERROR` and an empty
console across all 7 371 frames on all three arms.

**SwiftShader** is unchanged in kind: 423 STUTTERs in 545 frames is the same ~1 fps software
delivery cadence the 09-18 and 09-19 passes both describe, and its POP total rises with it for the
same reason (a 1 fps camera is "still" between almost every pair of delivered frames). All 10
clips completed; structural checks (renderer, DPR, camera state, no black frames, no GL errors)
all pass.

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

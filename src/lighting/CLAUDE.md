# src/lighting — photometric lighting rules

Area rules for photometric (luminaire) lighting. System map in `docs/ARCHITECTURE.md`.
(Room-lux / lighting-plan analysis lives in `src/lighting2d/`; the per-fixture night
emitters in `src/furniture/lightEmitters.ts`; the R3F lights in `src/scene/lighting/`.)

- **`ies/` is pure + render-agnostic.** `parseIes.ts` (LM-63 parser), `iesProfile.ts`
  (derived beam/field/peak metrics), `spotMapping.ts` (profile → Three `SpotLight`
  params) and `sampleProfiles.ts`/`iesStore.ts` (bundled + uploaded profile cache)
  must NOT import three.js, R3F, the store, or the DOM. Keep three.js mapping as plain
  numbers (`SpotParams`); the R3F component (`scene/lighting/FurnitureLights.tsx`)
  applies them. Each is unit-tested.
- **Parse once, cache.** Go through `iesStore.ts` (`resolveIesProfile` / `resolveIesSpot`)
  — never re-parse per frame. Bundled profiles are LM-63 **string literals** in
  `sampleProfiles.ts` (self-authored / public-domain — do NOT fetch `.ies` from the
  network or bundle scraped/licensed files).
- **Fail soft on bad input.** `parseIes` throws `IesParseError` on malformed/empty input;
  the resolver swallows that to `null` so the renderer falls back to a plain omni point
  light / default cone. Clamp derived cone angles to the valid `SpotLight` range
  (6–80°) — never emit `angle` outside `(0, π/2)`.
- **Feature flag.** Anything user-facing here is gated by `iesLights` (`tier: 'pro'`),
  unit-tested in both Simple and Pro modes.
- **`moodPresets.ts` (UX round-3 #3, `lightMoodPresets` flag, simple tier) is pure +
  render-agnostic** like `ies/` above — no three.js/R3F/store import. It composes a
  one-tap lighting mood (Normal/Reading/Movie night/Entertaining/Romantic) as a
  brightness multiplier (`moodIntensityMultiplier`, with a lower multiplier for
  registered ceiling-mounted kinds — `ceiling-light`/`ceiling-fan`/`cove-light`) +
  a warm/cool tint applied as a component-wise colour multiply
  (`applyMoodTint`/`applyMoodPreset`, same convention as `scene/lighting/
  windowLightModifiers.ts:glassTintRgb`). It composes ON TOP of the existing
  `lightsMode` ('auto'/'on'/'off') multiplier, never in place of it — the renderer
  (`scene/lighting/FurnitureLights.tsx`) multiplies `baseIntensity * lightsModeLevel
  * moodMultiplier`. It must NEVER be able to turn on a switched-off item: it only
  ever runs on fixtures that already passed the per-item `lightOn === 'no'` gate in
  `furniture/lightEmitters.ts` (`isItemEmitter`/`resolveEmitterSpec`), so a mood
  preset can only scale brightness/tint of an already-lit fixture. The active mood
  (`lightMood`) persists with the design (`state/schema.ts`/`storage/autosave.ts`),
  mirroring `lightsMode`.

- **The boot view does not degrade across the day, and at 21:00 the fixtures carry BRIGHTNESS but
  not CHROMA (BOOT-HOUR-SWEEP, v0.31.5.83).** Every orbit/boot number in `.56`–`.82` was `HOUR=9`,
  yet the flat boots `timeMode:'system'` — a real user arrives at whatever hour it is.
  **Hypothesis: the boot view degrades away from 09:00. FALSIFIED.**

  | hour (orbit, medium) | chroma | >0.35 sat | note |
  | --- | --- | --- | --- |
  | 09 | 0.158 | 3.2% | the baseline every other round used |
  | 13, lights off | 0.107 | 4.1% | the true DAYTIME boot |
  | 18 | 0.182 | 4.2% | |
  | 21, lights on | 0.249 | 15.9% | the true EVENING boot |
  | 21, lights off | 0.248 | 14.1% | control |

  · **The evening saturation is the LOW SUN, not the lamps.** Turning the fixtures off at 21:00
    moves chroma 0.249 -> 0.248 and the >0.35 tail only 15.9% -> 14.1%. A warm low sun is
    physically warm; this is not a fixture blow-out. For scale, `materials/CLAUDE.md` records the
    REJECTED Khronos Neutral operator at 21:00 orbit as chroma 0.518 with 89% past 0.35 — AgX is
    ~3.5x better on both, and the cropped frame reads as a warm lit room, not a cartoon.
  · **But the fixtures ARE load-bearing for BRIGHTNESS.** Differential over identical pixel regions
    in the two 21:00 frames: mean luminance **132.2 lights-on vs 16.9 lights-off**, ~7.8x. So
    `ensureDaylightFirstPaint` is what stands between an evening visitor and a near-black boot.
    **Chroma was the wrong lens for that question** (meta-rule xciv) — the two metrics disagree
    completely here, and only the luminance one answers it.
  · **Instrument: `chroma-audit` gained `LIGHTS=` and a RESOLVED-STATE print, and the print earned
    itself immediately.** The probe sets `timeMode:'manual'`, so `ensureDaylightFirstPaint` cannot
    fire inside it — but it fires at FIRST PAINT against the REAL wall clock, before that switch.
    Run at 22:25 local, all four original arms silently resolved to `lights=on`, including the
    "13:00" one that was supposed to represent an unlit daytime boot, and the lights-off control
    was a no-op reading byte-identical to its pair (meta-rule lxxxiii). Always pass `LIGHTS=`
    explicitly and read the `resolved …` field; never infer the lighting state from `HOUR=`.

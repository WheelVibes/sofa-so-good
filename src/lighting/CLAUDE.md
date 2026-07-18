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

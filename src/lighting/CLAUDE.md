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

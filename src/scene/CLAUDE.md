# src/scene — R3F rendering rules

Area rules for the 3D scene. System details in `docs/ARCHITECTURE.md`.

- **The main Canvas is `frameloop="demand"`** — never assume a continuous render loop.
  Anything that animates must keep `RenderPump` open (`renderDecision.ts`
  `shouldRender`/`isContinuous`/`settleTailMs`, all pure + unit-tested) and call
  `invalidate()` on change; a discrete store change already gets a short settle tail.
  Continuous-span FPS sampling is gated by `renderPumpSignal.ts` — don't sample raw frames.
  For DOM overlays that only need to appear/disappear (e.g. `FinishDragOverlay`) use a
  module-level signal (`finishDragSignal.ts` pattern: `useSyncExternalStore` subscriber +
  pure set/notify) — this avoids routing through the Zustand store and triggering
  `subscribe(markDirty)` on every drag event.
- **Tier-gate GPU cost.** Read `RenderTier`; **Performance is the default for everyone**
  (flat: no shadows/IBL/post, DPR 1). Heavy effects (real mirrors, post stack) are
  High/Maximum only (`mirrorReflectorConfig(tier)` is the pattern).
- **Tone mapping is context-aware** (`toneContext.ts`, pure + unit-tested). The stored user
  setting is `ToneMappingSetting` (`auto` | filmic | agx | neutral); `Lighting` resolves the
  concrete operator each frame via `resolveToneMapping(setting, ctx)` — never read `st.toneMapping`
  raw for the renderer. An explicit pick wins; `'auto'` picks Neutral while previewing finishes,
  AgX for a photo context, else filmic. Keep `look.ts` pure (no three) — the three constant comes
  from `toneMappingThree.ts`.
- **Materials**: pass a real three `Material` to `material=`, never a props object.
- **Mount expensive controllers once**; collapse repeat geometry via `InstancedBoxes`.
  `ContextLossGuard` must stay mounted in **both** Canvases (main + room editor).
- The room editor uses a **separate lightweight Canvas** with none of the sun/Effects
  systems — keep that boundary; don't leak heavy systems into it.
- **Zero artifacts.** Realism work must introduce **no z-fighting or clipping**: offset
  coplanar overlays off the surface (e.g. floor decals at +~0.005 m, `depthWrite` off,
  `transparent`), keep parts from intersecting, and orbit to a side/profile angle to confirm
  contact (top-down hides float/sink). Visually verify per the playbook — green tests are
  not proof the render is right.

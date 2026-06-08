# src/scene — R3F rendering rules

Area rules for the 3D scene. System details in `docs/ARCHITECTURE.md`.

- **The main Canvas is `frameloop="demand"`** — never assume a continuous render loop.
  Anything that animates must keep `RenderPump` open (`renderDecision.ts`
  `shouldRender`/`isContinuous`/`settleTailMs`, all pure + unit-tested) and call
  `invalidate()` on change; a discrete store change already gets a short settle tail.
  Continuous-span FPS sampling is gated by `renderPumpSignal.ts` — don't sample raw frames.
- **Tier-gate GPU cost.** Read `RenderTier`; **Performance is the default for everyone**
  (flat: no shadows/IBL/post, DPR 1). Heavy effects (real mirrors, post stack) are
  High/Maximum only (`mirrorReflectorConfig(tier)` is the pattern).
- **Materials**: pass a real three `Material` to `material=`, never a props object.
- **Mount expensive controllers once**; collapse repeat geometry via `InstancedBoxes`.
  `ContextLossGuard` must stay mounted in **both** Canvases (main + room editor).
- The room editor uses a **separate lightweight Canvas** with none of the sun/Effects
  systems — keep that boundary; don't leak heavy systems into it.

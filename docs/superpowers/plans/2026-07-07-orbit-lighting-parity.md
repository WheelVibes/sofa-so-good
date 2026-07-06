# Orbit / Room-editor Lighting Parity + Virtual Ceiling + Lossless "Original" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make orbit and the room editor run the full walk-mode lighting simulation (sun, shadows, exposure grading, bloom) at every tier, add an invisible shadow-casting virtual ceiling so the open-top orbit view is lit through windows/openings only, and guarantee the "Original" asset tier is truly lossless on mobile and desktop.

**Architecture:** Retire the "dollhouse" daytime-orbit suppression (`Lighting.tsx`, `EffectsImpl.tsx`, delete `dollhouse.ts`). Introduce a pure `occluderRectsForPlan(plan)` helper + a dumb `CeilingOccluder` R3F component whose shared material is invisible in the beauty pass (`colorWrite:false`, `depthWrite:false`) but `castShadow` with `shadowSide: DoubleSide`, so the overhead sun is blocked while the camera still sees in. Mount it in both `Scene.tsx` and `RoomEditorScene.tsx`. Lock the lossless-`high` guarantee with regression tests.

**Tech Stack:** React + TypeScript, Three.js via @react-three/fiber, Zustand store, Vitest (node default; happy-dom only where DOM is touched), Biome.

## Global Constraints

- **Commit only when the human asks.** This repo's rule (root CLAUDE.md) overrides the skill's per-task `git commit` steps: complete each task's code+tests, but do **not** run `git commit`/`git add` unless the user says so. Treat the "Commit" steps below as "stop, report, await go-ahead".
- **Version:** bump the `build` in `src/version.ts` (currently `0.16.1.3` → `0.16.1.4`) and mirror the first three parts in `package.json`. Never bump major. PR title must state the version, e.g. `… (v0.16.1.4)`.
- **Biome style:** 2-space indent, 100-col, single quotes, no semicolons.
- **Tests:** Vitest defaults to the **node** environment; a test that touches the DOM must start with `// @vitest-environment happy-dom`. While iterating run targeted tests only (`npx vitest --run <path>`); run the full suite exactly once before finishing. **Never** pipe test output through `tail`/`head` — redirect to a log file and grep the file.
- **No hardcoded colour** in UI/DOM (token classes only). (Not applicable to three material colours here.)
- **Visual verification** is required after app changes: green tsc/tests are not proof the render is right. Read `docs/visual-verification-playbook.md` before Task 8.
- **Both view modes / both device sizes:** any mode- or tier-dependent behaviour is verified in orbit, room editor, and walk, and at a mobile viewport.

---

### Task 1: Pure occluder-rects helper

**Files:**
- Create: `src/apartment/ceiling/ceilingOccluder.ts`
- Test: `src/apartment/ceiling/ceilingOccluder.test.ts`

**Interfaces:**
- Consumes: `FloorPlan`, `roomPolygon` from `src/floorplan/types.ts`; `ROOMS` from `src/apartment/constants.ts`; `RoomId` from `src/apartment/types.ts`.
- Produces: `interface OccluderRect { id: string; cx: number; cz: number; w: number; d: number; y: number }` and `occluderRectsForPlan(plan: FloorPlan): OccluderRect[]`.

Notes: mirrors `Ceiling.tsx`'s room selection — one axis-aligned rect per **non-external** plan room (external areas like balconies/service yards are never roofed), sized to the room's outline bounding box (covers rect + L-extension + explicit polygon) at the room's resolved ceiling height. `y` resolves `room.ceilingHeight` → the `ROOMS` constant's per-room `ceilingHeight` → the plan default. Pure (no three/React/DOM) so it runs in the node test env.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from '../../floorplan/defaultPlan'
import { occluderRectsForPlan } from './ceilingOccluder'

describe('occluderRectsForPlan', () => {
  it('emits a rect per non-external room of the default plan', () => {
    const plan = buildDefaultPlan()
    const rects = occluderRectsForPlan(plan)
    // Every rect maps to a real plan room id, has positive extent, and a
    // ceiling-height y above the floor.
    expect(rects.length).toBeGreaterThan(0)
    for (const r of rects) {
      expect(plan.rooms.some((pr) => pr.id === r.id)).toBe(true)
      expect(r.w).toBeGreaterThan(0)
      expect(r.d).toBeGreaterThan(0)
      expect(r.y).toBeGreaterThan(1.5)
    }
  })

  it('excludes external rooms (balcony / service yard / ledges)', () => {
    const plan = buildDefaultPlan()
    const rects = occluderRectsForPlan(plan)
    const ids = new Set(rects.map((r) => r.id))
    // A room flagged external in ROOMS must not be roofed.
    expect(ids.has('serviceYard')).toBe(false)
    expect(ids.has('acLedge')).toBe(false)
  })

  it('centres the rect on the room outline bounding box', () => {
    const plan = buildDefaultPlan()
    const bedroom = plan.rooms.find((r) => r.id === 'bedroom2')
    expect(bedroom).toBeTruthy()
    const rect = occluderRectsForPlan(plan).find((r) => r.id === 'bedroom2')
    expect(rect).toBeTruthy()
    // bedroom2 origin [3.15, 0.2], 2.85 x 3.4 → centre (4.575, 1.9).
    expect(rect?.cx).toBeCloseTo(3.15 + 2.85 / 2, 3)
    expect(rect?.cz).toBeCloseTo(0.2 + 3.4 / 2, 3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run src/apartment/ceiling/ceilingOccluder.test.ts`
Expected: FAIL — `occluderRectsForPlan` is not defined / module not found.

- [ ] **Step 3: Write the implementation**

```ts
import type { RoomId } from '../types'
import { ROOMS } from '../constants'
import { type FloorPlan, roomPolygon } from '../../floorplan/types'

/** One horizontal occluder plane spec, footprint-centred at ceiling height. */
export interface OccluderRect {
  id: string
  cx: number
  cz: number
  w: number
  d: number
  y: number
}

/**
 * Axis-aligned occluder rects — one per non-external plan room — sized to the
 * room's outline bounding box (rect + L-extension + explicit polygon) at its
 * resolved ceiling height. Mirrors `Ceiling.tsx`'s `!external` room selection:
 * external areas (balcony / service yard / AC ledge) are open to the sky and
 * never roofed. Pure (no three/React) so it stays unit-testable.
 */
export function occluderRectsForPlan(plan: FloorPlan): OccluderRect[] {
  const out: OccluderRect[] = []
  for (const r of plan.rooms) {
    const def = ROOMS[r.id as RoomId]
    // External rooms are open to the sky (matches Ceiling.tsx's !external).
    if (def?.external) continue
    const poly = roomPolygon(r)
    let minX = Number.POSITIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    for (const [x, z] of poly) {
      if (x < minX) minX = x
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (z > maxZ) maxZ = z
    }
    if (!Number.isFinite(minX)) continue
    const y = r.ceilingHeight ?? def?.ceilingHeight ?? plan.ceilingHeight
    out.push({
      id: r.id,
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
      y,
    })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run src/apartment/ceiling/ceilingOccluder.test.ts`
Expected: PASS (3 tests). If the `serviceYard`/`acLedge` ids differ, grep `src/apartment/constants.ts` for `external: true` entries and use those exact ids in the test.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit** — per Global Constraints, stop and report; do not commit unless asked.

---

### Task 2: `CeilingOccluder` component + shared shadow-only material

**Files:**
- Create: `src/apartment/ceiling/CeilingOccluder.tsx`

**Interfaces:**
- Consumes: `OccluderRect` from `./ceilingOccluder` (Task 1).
- Produces: `export function CeilingOccluder({ rects }: { rects: OccluderRect[] })`.

Notes: no unit test — it's a thin R3F render wrapper with no branching logic (verified visually in Task 8). The material is the whole point: invisible in the beauty pass (`colorWrite:false`, `depthWrite:false`, `transparent`, `opacity:0`) so the orbit camera sees straight through, but each mesh `castShadow` with `material.shadowSide = DoubleSide` so the overhead sun's depth pass captures it. One shared material instance (mirrors `RoomCeiling.tsx`'s `CEILING_MAT` sharing).

- [ ] **Step 1: Write the component**

```tsx
import { DoubleSide, MeshBasicMaterial } from 'three'
import type { OccluderRect } from './ceilingOccluder'

/**
 * Shared occluder material: writes NOTHING to the colour or depth buffer in the
 * beauty pass (so the orbit camera sees straight into the room), but the meshes
 * that use it are `castShadow` so they still render into the sun's shadow map.
 * `shadowSide: DoubleSide` guarantees the overhead sun captures the plane
 * regardless of winding. One instance, shared across every plane.
 */
const OCCLUDER_MAT = new MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  transparent: true,
  opacity: 0,
  side: DoubleSide,
})
OCCLUDER_MAT.shadowSide = DoubleSide

/**
 * Invisible shadow-casting "virtual ceiling" (ORBIT-CEILING). Orbit culls the
 * real ceiling so you can see in; without this the directional sun would pour
 * straight down onto the floor. These planes block the sun so the interior is
 * lit through windows / open doors only — "as if a ceiling were there" — while
 * staying invisible to the camera. Present in walk mode too, so both views are
 * physically consistent. Costs one extra shadow-caster draw per room, and only
 * where sun shadows already run (no-op when `shadowMapSize === 0`).
 */
export function CeilingOccluder({ rects }: { rects: OccluderRect[] }) {
  return (
    <group>
      {rects.map((r) => (
        <mesh
          key={r.id}
          castShadow
          position={[r.cx, r.y, r.cz]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={OCCLUDER_MAT}
        >
          <planeGeometry args={[r.w, r.d]} />
        </mesh>
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit** — stop and report; do not commit unless asked.

---

### Task 3: Mount the occluder in both scenes

**Files:**
- Modify: `src/scene/Scene.tsx` (add a store read + `<CeilingOccluder>` inside the R3F tree)
- Modify: `src/scene/RoomEditorScene.tsx` (add `<CeilingOccluder>` scoped to the edited room)

**Interfaces:**
- Consumes: `CeilingOccluder` (Task 2), `occluderRectsForPlan` (Task 1), `useStore`, `useMemo`.

Notes: mounting the occluder BEFORE removing dollhouse (Tasks 4–5) keeps orbit daytime from ever blowing out. The occluder only affects the sun shadow map, so it's a visual no-op on the Performance tier (`shadowMapSize === 0`) but ready for Medium+.

- [ ] **Step 1: Scene.tsx — import + rects**

Add imports near the other `../apartment/*` and hook imports at the top of `src/scene/Scene.tsx`:

```tsx
import { useMemo } from 'react'
import { CeilingOccluder } from '../apartment/ceiling/CeilingOccluder'
import { occluderRectsForPlan } from '../apartment/ceiling/ceilingOccluder'
```

(If `useMemo` is already imported from `react`, merge it into the existing import rather than adding a duplicate line.)

Inside the `Scene` component body, alongside the existing store reads (there is already a `customPlan` selector), add:

```tsx
const floorPlan = useStore((s) => s.floorPlan)
const occluderRects = useMemo(() => occluderRectsForPlan(floorPlan), [floorPlan])
```

- [ ] **Step 2: Scene.tsx — render**

Immediately after the `{customPlan ? <PlanShell /> : <Apartment />}` line (`src/scene/Scene.tsx:111`), add:

```tsx
        <CeilingOccluder rects={occluderRects} />
```

- [ ] **Step 3: RoomEditorScene.tsx — import + rects + render**

Add imports at the top of `src/scene/RoomEditorScene.tsx`:

```tsx
import { useMemo } from 'react'
import { CeilingOccluder } from '../apartment/ceiling/CeilingOccluder'
import { occluderRectsForPlan } from '../apartment/ceiling/ceilingOccluder'
```

(Merge `useMemo` into any existing `react` import.)

The component already has `const roomId = useStore((s) => s.roomEditor.roomId)` and `const plan = useStore((s) => s.floorPlan)`. After those, add:

```tsx
  const occluderRects = useMemo(
    () => occluderRectsForPlan(plan).filter((r) => r.id === roomId),
    [plan, roomId],
  )
```

Then render it right after the room shell block (after the `editorShell.kind === 'default' ? <RoomShell…/> : <PlanRoomShell…/>` element, around `src/scene/RoomEditorScene.tsx:117`):

```tsx
      <CeilingOccluder rects={occluderRects} />
```

- [ ] **Step 4: Typecheck + targeted render smoke**

Run: `npx tsc --noEmit`
Expected: no errors. (Full visual check is Task 8.)

- [ ] **Step 5: Commit** — stop and report; do not commit unless asked.

---

### Task 4: Remove dollhouse suppression from `Lighting.tsx`

**Files:**
- Modify: `src/scene/lighting/Lighting.tsx`

**Interfaces:**
- Removes the `isDollhouseLighting`/`setDollhouseActive` import and the `DOLLHOUSE_*` constants; the sun/exposure/fill now always take the graded path (still gated by `shadowMapSize > 0` and IBL fill scaling).

- [ ] **Step 1: Remove the dollhouse import**

Delete this line (`src/scene/lighting/Lighting.tsx:12`):

```tsx
import { isDollhouseLighting, setDollhouseActive } from './dollhouse'
```

- [ ] **Step 2: Remove the DOLLHOUSE constants**

Delete lines 22–26 (the block starting `/** Flat uniform fill for the orbit daytime dollhouse …`):

```tsx
/** Flat uniform fill for the orbit daytime dollhouse (ORBIT-DOLLHOUSE) — even
 *  brightness, no directional bias (sky≈ground), no sun/shadow. */
const DOLLHOUSE_HEMI = 1.45
const DOLLHOUSE_AMBIENT = 0.75
const DOLLHOUSE_FILL: [number, number, number] = [1, 0.99, 0.97]
```

- [ ] **Step 3: Remove the dollhouse computation + fixed exposure**

Replace this block (currently `src/scene/lighting/Lighting.tsx:134-145`):

```tsx
    // Orbit dollhouse (ORBIT-DOLLHOUSE): in orbit + daytime + lights-not-forced-on
    // the ceiling-less view shouldn't simulate exterior sun. Use a neutral, fixed
    // exposure (no day grading swing) and a flat uniform fill below; walk mode and
    // night orbit keep the real graded simulation. Material IBL/sheen/gloss stay.
    const dollhouse = isDollhouseLighting({
      cameraMode: st.cameraMode,
      sunAltitude: sunPos.altitude,
      lightsMode: st.lightsMode ?? 'auto',
    })
    setDollhouseActive(dollhouse)
    gl.toneMappingExposure =
      (dollhouse ? 1.0 : grade(sunPos.altitude).exposure) * toneExposureBias(toneMode) * st.exposure
```

with (ORBIT-CEILING: orbit/editor now run the real graded sun; the virtual ceiling occluder blocks top-flood):

```tsx
    // Orbit + the room editor run the full graded exterior-sun simulation, same
    // as walk mode (ORBIT-CEILING); the invisible ceiling occluder blocks the sun
    // from pouring in through the open top, so it's lit through windows/openings.
    gl.toneMappingExposure =
      grade(sunPos.altitude).exposure * toneExposureBias(toneMode) * st.exposure
```

- [ ] **Step 4: Restore the real sun intensity + shadow**

Replace (currently `src/scene/lighting/Lighting.tsx:186-189`):

```tsx
      // Dollhouse: kill the directional sun + its shadow (no exterior sim); the
      // uniform fill below lights the scene instead.
      sunRef.current.intensity = dollhouse ? 0 : cur.sun * attenuation
      sunRef.current.castShadow = !dollhouse && shadowMapSize > 0
```

with:

```tsx
      sunRef.current.intensity = cur.sun * attenuation
      sunRef.current.castShadow = shadowMapSize > 0
```

- [ ] **Step 5: Restore the graded hemi + ambient fill**

Replace the hemi block (currently `src/scene/lighting/Lighting.tsx:205-220`):

```tsx
    if (hemiRef.current) {
      // Dollhouse: a bright, neutral, direction-free fill (sky≈ground) for even
      // dollhouse brightness; otherwise the graded day/night sky+ground GI.
      hemiRef.current.intensity = dollhouse ? DOLLHOUSE_HEMI : cur.ambient * 1.1 * fillScale
      if (dollhouse) {
        hemiRef.current.color.setRGB(...DOLLHOUSE_FILL)
        hemiRef.current.groundColor.setRGB(...DOLLHOUSE_FILL)
      } else {
        hemiRef.current.color.setRGB(cur.skyColor[0], cur.skyColor[1], cur.skyColor[2])
        hemiRef.current.groundColor.setRGB(
          cur.groundColor[0],
          cur.groundColor[1],
          cur.groundColor[2],
        )
      }
    }
```

with:

```tsx
    if (hemiRef.current) {
      hemiRef.current.intensity = cur.ambient * 1.1 * fillScale
      hemiRef.current.color.setRGB(cur.skyColor[0], cur.skyColor[1], cur.skyColor[2])
      hemiRef.current.groundColor.setRGB(cur.groundColor[0], cur.groundColor[1], cur.groundColor[2])
    }
```

Then replace the ambient line (currently `src/scene/lighting/Lighting.tsx:221-222`):

```tsx
    if (ambientRef.current)
      ambientRef.current.intensity = dollhouse ? DOLLHOUSE_AMBIENT : cur.ambient * 0.35 * fillScale
```

with:

```tsx
    if (ambientRef.current) ambientRef.current.intensity = cur.ambient * 0.35 * fillScale
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors, no unused-import/variable complaints (Biome will flag any leftover `dollhouse`/`DOLLHOUSE_*` reference — grep to be sure).

Run: `grep -n "dollhouse\|DOLLHOUSE" src/scene/lighting/Lighting.tsx`
Expected: no matches.

- [ ] **Step 7: Commit** — stop and report; do not commit unless asked.

---

### Task 5: Remove dollhouse from `EffectsImpl.tsx` and delete `dollhouse.ts`

**Files:**
- Modify: `src/scene/EffectsImpl.tsx`
- Delete: `src/scene/lighting/dollhouse.ts`
- Delete: `src/scene/lighting/dollhouse.test.ts` (if present)

**Interfaces:**
- After this task, no file imports `dollhouse`. Bloom follows the normal day-ramped path in all modes.

**Guardrail:** Only `Lighting.tsx` (Task 4) and `EffectsImpl.tsx` read the *lighting* predicate. Do **not** touch the many unrelated `"dollhouse"` mentions in `OrbitCamera.tsx`, `verticalLock.ts`, `frameSelection.ts`, wall-reveal, or ceiling-cull comments — those name the orbit *camera framing / wall-reveal*, a separate concept that stays.

- [ ] **Step 1: Remove the import (EffectsImpl.tsx:17)**

```tsx
import { isDollhouseLighting } from './lighting/dollhouse'
```

Delete that line.

- [ ] **Step 2: Replace the bloom-intensity block**

Replace (currently `src/scene/EffectsImpl.tsx:73-79`):

```tsx
  // Orbit daytime dollhouse (ORBIT-DOLLHOUSE): no bloom — it's a flat, uniform
  // view, not the exterior-sun simulation. Walk + night orbit keep the day-ramped
  // bloom (genuinely-emissive fixtures glow at night, →0 at midday).
  const cameraMode = useStore((s) => s.cameraMode)
  const lightsMode = useStore((s) => s.lightsMode ?? 'auto')
  const dollhouse = isDollhouseLighting({ cameraMode, sunAltitude: sun.altitude, lightsMode })
  const bloomIntensity = dollhouse ? 0 : bloomIntensityForDay(dayLevel)
```

with:

```tsx
  // Bloom follows the day-ramped path in every mode (ORBIT-CEILING): full at
  // night so genuinely-emissive fixtures glow, →0 at midday so sunlit surfaces
  // don't smear. Orbit/editor no longer suppress it.
  const bloomIntensity = bloomIntensityForDay(dayLevel)
```

If `useStore` is now unused in `EffectsImpl.tsx`, remove its import too. Check:

Run: `grep -n "useStore" src/scene/EffectsImpl.tsx`
If the only match was the deleted lines, delete the `import { useStore } from '../state/store'` line.

- [ ] **Step 3: Delete the dollhouse module + its test**

```bash
rm src/scene/lighting/dollhouse.ts
[ -f src/scene/lighting/dollhouse.test.ts ] && rm src/scene/lighting/dollhouse.test.ts || true
```

- [ ] **Step 4: Confirm no dangling references**

Run: `grep -rn "isDollhouseLighting\|setDollhouseActive\|getDollhouseActive\|from './dollhouse'\|from '../lighting/dollhouse'\|lighting/dollhouse" src`
Expected: no matches.

- [ ] **Step 5: Typecheck + targeted tests**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest --run src/scene > /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/b5b96d68-9205-45ab-b59c-09031a6834e4/scratchpad/vitest-scene.log 2>&1; grep -E "Test Files|Tests |FAIL" /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/b5b96d68-9205-45ab-b59c-09031a6834e4/scratchpad/vitest-scene.log`
Expected: all pass. Any test that asserted dollhouse behaviour (e.g. `EffectsImpl`/`Lighting`-adjacent) must be updated to the new always-graded behaviour or removed if it only covered `dollhouse.ts`.

- [ ] **Step 6: Commit** — stop and report; do not commit unless asked.

---

### Task 6: Docs + version bump + CHANGELOG

**Files:**
- Modify: `src/version.ts` (`0.16.1.3` → `0.16.1.4`)
- Modify: `package.json` (version → `0.16.1`, unchanged first-three if already `0.16.1`; keep in sync)
- Modify: `src/scene/CLAUDE.md` (rewrite the ORBIT-DOLLHOUSE rule)
- Modify: `docs/ARCHITECTURE.md` (orbit lighting section)
- Modify: `docs/visual-verification-playbook.md` (add orbit-roofed-lighting check)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Version**

Set `src/version.ts` `APP_VERSION = '0.16.1.4'`. Confirm `package.json` `"version": "0.16.1"` (bump only if it lags; the first three parts must match `0.16.1`).

- [ ] **Step 2: Rewrite the ORBIT-DOLLHOUSE rule in `src/scene/CLAUDE.md`**

Replace the bullet that begins **"Orbit daytime is a flat dollhouse, not an exterior sim"** with a rule describing the new model. Content to convey (match the file's terse bullet style):

```
- **Orbit + the room editor run the full walk-mode lighting simulation** (ORBIT-CEILING,
  replaces the retired ORBIT-DOLLHOUSE flat-fill). The graded sun, PCF sun shadows, day/night
  exposure grading, and day-ramped bloom apply in every view mode at every tier (still gated by
  the tier's `shadowMapSize`/`postprocessing`). Orbit culls the real ceiling so you can see in;
  an invisible shadow-casting **virtual ceiling** (`apartment/ceiling/CeilingOccluder.tsx`, planes
  from the pure `ceilingOccluder.ts:occluderRectsForPlan`) blocks the sun from flooding in through
  the open top, so interiors are lit through windows/open doors — mounted in BOTH `Scene.tsx` and
  `RoomEditorScene.tsx`, present in walk mode too for consistency. The occluder material writes no
  colour/depth (invisible to the camera) but `castShadow` with `shadowSide: DoubleSide`. There is
  no `dollhouse.ts` module and no dollhouse module-signal anymore — do NOT reintroduce a per-mode
  lighting suppression. (The unrelated orbit *camera-framing* "dollhouse" in `OrbitCamera.tsx`/wall
  reveal is a different concept and stays.)
```

Also fix the two later bullets in the same file that reference the retired behaviour: the **Bloom** bullet and the **RoomEditorScene** bullet mention "daytime lighting is already the flat neutral dollhouse fill" / "orbit daytime is a flat dollhouse" — update those phrases to the new "full graded simulation + virtual ceiling" wording. Grep to find them:

Run: `grep -n "dollhouse" src/scene/CLAUDE.md`
Update each *lighting-related* mention (leave camera-framing/wall-reveal ones).

- [ ] **Step 3: `RoomEditorScene.tsx` inline comment**

The `ROOM-EDITOR-BACKDROP` comment block (around `src/scene/RoomEditorScene.tsx:98-107`) ends with "daytime lighting is already the flat neutral dollhouse fill (orbit + day)." Update that final sentence to: "daytime lighting is the full graded sun simulation, roofed by the virtual ceiling occluder (ORBIT-CEILING)." Keep the rest of the backdrop rationale (the neutral background still prevents sky bleed through faded walls).

- [ ] **Step 4: ARCHITECTURE.md + playbook**

In `docs/ARCHITECTURE.md`, find the orbit/dollhouse lighting description and replace it with the ORBIT-CEILING model (2–3 sentences: full simulation in all modes + invisible virtual-ceiling occluder). In `docs/visual-verification-playbook.md`, add a checklist item: "Orbit daytime (Medium+ tier): sun shadows present, interior lit through windows/openings (not flooded from the open top), see-in view intact; confirm no z-fighting/occlusion pop from the ceiling occluder."

Run: `grep -rn "dollhouse" docs/ARCHITECTURE.md`
Update lighting-related mentions only.

- [ ] **Step 5: CHANGELOG.md**

Add an entry under the current version line:

```
- **Orbit & room-editor lighting parity (v0.16.1.4).** Orbit and the room editor now run the full
  walk-mode lighting simulation (graded sun, PCF shadows, exposure grading, bloom) at every tier,
  replacing the flat daytime "dollhouse" fill. An invisible shadow-casting virtual ceiling keeps the
  open-top orbit view lit through windows/openings only. Identical on mobile and desktop.
```

- [ ] **Step 6: Commit** — stop and report; do not commit unless asked.

---

### Task 7: Guarantee "Original" asset quality is lossless (verify + lock-in)

**Files:**
- Test: `src/furniture/gltf/losslessOriginal.test.ts` (create)
- Modify (only if the audit finds a real leak): the offending file.

**Interfaces:**
- Consumes: `resolveLodUrlSync`, `__resetLodCacheForTest` from `src/furniture/gltf/lod.ts`; `applyTextureBudget` from `src/furniture/gltf/textureBudget.ts`; `effectiveAssetTier` from `src/scene/quality.ts`.

Notes: the resolution path has **no device/mobile branch** — `effectiveAssetTier(assetTier, renderTier)` returns `assetTier` when set, and `resolveLodUrlSync(url,'high')`/`applyTextureBudget(root,'high')` are already lossless. This task (a) locks that in with regression tests and (b) runs an explicit audit so any hidden downscale-on-`high` is caught. "Same on mobile and desktop" is satisfied by there being no device input to these functions — the test asserts that invariant by exercising the pure functions directly (they can't differ by device).

- [ ] **Step 1: Write the regression test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { effectiveAssetTier } from '../../scene/quality'
import { __resetLodCacheForTest, resolveLodUrlSync } from './lod'
import { applyTextureBudget } from './textureBudget'

describe('Original (high) asset tier is lossless', () => {
  it('resolves to the base GLB url with no LOD suffix', () => {
    __resetLodCacheForTest()
    const url = 'https://example.com/assets/furniture/sofa.glb'
    expect(resolveLodUrlSync(url, 'high')).toBe(url)
  })

  it('applyTextureBudget is a no-op on high (never resizes)', () => {
    const resize = vi.fn()
    // A fake mesh whose texture is well over any budget cap.
    const tex = { image: { width: 8192, height: 8192 }, needsUpdate: false }
    const root = {
      traverse(fn: (o: unknown) => void) {
        fn({ isMesh: true, material: { map: tex } })
      },
    } as unknown as import('three').Object3D
    applyTextureBudget(root, 'high', resize as never)
    expect(resize).not.toHaveBeenCalled()
    expect(tex.needsUpdate).toBe(false)
  })

  it('an explicit Original choice is never overridden by the render tier', () => {
    // Whatever the render tier (incl. the mobile/desktop default Performance),
    // an explicit high asset tier stays high — no device branch exists.
    expect(effectiveAssetTier('high', 'performance')).toBe('high')
    expect(effectiveAssetTier('high', 'medium')).toBe('high')
    expect(effectiveAssetTier('high', 'maximum')).toBe('high')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest --run src/furniture/gltf/losslessOriginal.test.ts`
Expected: PASS (3 tests). If any FAIL, that pins the real leak — proceed to Step 3.

- [ ] **Step 3: Audit for any residual downscaling on `high`**

Run each and confirm the finding:

```bash
grep -rn "isMobile\|navigator\|userAgent\|maxTexture\|anisotropy\|generateMipmaps" src/furniture/gltf src/furniture/GltfModel.tsx src/scene/AnisotropyController.tsx
```

Confirm: (a) `GltfModel.tsx` uses `effectiveAssetTier(assetTier, renderTier)` and calls `applyTextureBudget(root, qualityTier)` — which no-ops for `high`; (b) no code path forces a lower asset tier or caps texture size on mobile. If a genuine leak exists (e.g. a device-based texture cap applied regardless of tier), guard it with `if (tier !== 'high')` and add a failing-then-passing test for it. If the audit is clean (expected), record "no residual downscaling; Original is lossless by construction" in the task report — the tests are the lock-in.

- [ ] **Step 4: Clarify the Graphics-panel copy (optional, only if unclear)**

`src/ui/GraphicsSettings.tsx:227-230` already says '"Original" loads full-resolution assets even on Low.' Leave as-is unless verification shows it's misleading; if the user's confusion was Auto→low on the default tier, no code change is needed — the explicit Original option already works.

- [ ] **Step 5: Commit** — stop and report; do not commit unless asked.

---

### Task 8: Full-suite run + visual verification (both modes, both device sizes)

**Files:** none (verification only). Read `docs/visual-verification-playbook.md` first for harness rules + the scenario template.

- [ ] **Step 1: Full test suite (exactly once)**

Run: `npx vitest --run > /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/b5b96d68-9205-45ab-b59c-09031a6834e4/scratchpad/vitest-full.log 2>&1; grep -E "Test Files|Tests |FAIL" /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/b5b96d68-9205-45ab-b59c-09031a6834e4/scratchpad/vitest-full.log`
Expected: all pass. Investigate any FAIL by name from the log file (never rerun through `tail`).

- [ ] **Step 2: tsc + biome**

Run: `npx tsc --noEmit && npm run check`
Expected: clean.

- [ ] **Step 3: Visual verification (Medium+ tier)**

Start the dev server, force a shadowed tier via `window.__store`, and capture orbit daytime, the room editor, and walk mode. Use the scenario harness per the playbook, e.g.:

```bash
npm run dev   # (background) → http://localhost:5173
node scripts/shot.mjs --scenario scripts/scenarios/<new-or-existing>.json --out-dir /tmp/claude-1000/-home-cwlroda-projects-sofa-so-good/b5b96d68-9205-45ab-b59c-09031a6834e4/scratchpad/shots
```

Set the render tier to `medium` (or higher) in the scenario (`store` step setting `qualityTier`) and noon/day time, `lightsMode: 'auto'`. Capture:
  - **Orbit, daytime**: sun shadows present under furniture; interior reads roofed (no bright top-flood on the floor); rooms still visible from above.
  - **Room editor**: matches orbit (shadows + roofed lighting).
  - **Walk mode, daytime**: **no regression** — interior lit by window light + IBL + fixtures, not direct sun rectangles from the roof. If walk regresses badly, fall back to scoping the occluder to orbit + editor only (guard the `<CeilingOccluder>` in `Scene.tsx` on `cameraMode === 'orbit'`) and re-verify.
  - Confirm **no z-fighting / occlusion pop** from the occluder plane while orbiting.

- [ ] **Step 4: Mobile viewport pass**

Repeat the orbit-daytime capture at a mobile viewport (scenario `viewport` step, e.g. 390×844) and confirm identical roofed lighting + shadows (same tier), no device-specific difference.

- [ ] **Step 5: Report**

Write up what each screenshot showed (not just "looks fine") — shadows present, interior roofed, walk unchanged, mobile matches desktop. Attach the paths. This is the completion evidence.

- [ ] **Step 6: Commit** — stop and report; do not commit unless asked.

---

## Self-Review

**Spec coverage:**
- Part 1 (remove dollhouse suppression) → Tasks 4, 5. ✓
- Part 2 (virtual ceiling occluder, both ceiling paths, both modes, mobile+desktop) → Tasks 1, 2, 3 (single `floorPlan.rooms`-driven occluder covers both `Apartment` and `PlanShell`, mounted in `Scene.tsx` + `RoomEditorScene.tsx`). ✓
- Part 3 (lossless Original, mobile+desktop) → Task 7. ✓
- Cross-cutting (version, CHANGELOG, docs, visual verification) → Tasks 6, 8. ✓
- Walk-mode-regression checkpoint + orbit-only fallback → Task 8 Step 3. ✓

**Placeholder scan:** every code step carries full code; no TBD/TODO. ✓

**Type consistency:** `OccluderRect { id, cx, cz, w, d, y }` and `occluderRectsForPlan(plan)` are defined in Task 1 and consumed with the same names/shape in Tasks 2–3. `CeilingOccluder({ rects })` prop name is consistent across Tasks 2 and 3. ✓

**Known assumptions to verify during execution:** external-room ids (`serviceYard`/`acLedge`) in Task 1's test — confirm against `grep "external: true" src/apartment/constants.ts` and adjust the exact ids if they differ (does not change the implementation, only the test's expected exclusions).

# Mobile walk-mode controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let touch users look around (drag) and move (translucent analog joystick) in walk mode, where Pointer Lock is unavailable.

**Architecture:** A module-level mutable singleton (`walkInput`) carries a normalized move vector from a DOM joystick overlay into `FirstPersonCamera`'s `useFrame`, decoupling the DOM and R3F trees. The camera also gains a touch drag-to-look path that replaces Pointer Lock on coarse-pointer devices. A new `WalkJoystick` DOM overlay renders next to `Crosshair`, gated on walk mode + coarse pointer.

**Tech Stack:** React + TypeScript, @react-three/fiber, Three.js, Zustand, Vitest, design-system CSS tokens.

---

### Task 1: `walkInput` shared move-vector singleton + pure normalization

**Files:**
- Create: `src/scene/walkInput.ts`
- Test: `src/scene/walkInput.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { walkInput, setWalkMove, resetWalkMove, normalizeJoystick } from './walkInput'

describe('normalizeJoystick', () => {
  it('returns zero inside the dead-zone', () => {
    expect(normalizeJoystick(2, -1, 60, 0.15)).toEqual({ x: 0, y: 0 })
  })
  it('maps offset to a unit-capped vector past the dead-zone', () => {
    // offset straight right at the radius edge → x≈1, y≈0
    const v = normalizeJoystick(60, 0, 60, 0.15)
    expect(v.x).toBeCloseTo(1, 5)
    expect(v.y).toBeCloseTo(0, 5)
  })
  it('clamps magnitude to 1 beyond the radius', () => {
    const v = normalizeJoystick(120, 0, 60, 0.15)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5)
  })
})

describe('walkInput singleton', () => {
  beforeEach(() => resetWalkMove())
  it('starts at zero', () => {
    expect(walkInput.move).toEqual({ x: 0, y: 0 })
  })
  it('setWalkMove updates and resetWalkMove zeroes', () => {
    setWalkMove(0.5, -0.5)
    expect(walkInput.move).toEqual({ x: 0.5, y: -0.5 })
    resetWalkMove()
    expect(walkInput.move).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/scene/walkInput.test.ts`
Expected: FAIL (module not found / exports undefined).

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Shared walk-mode move input. The mobile joystick (DOM) writes the current
 * normalized move vector here; FirstPersonCamera (R3F canvas) reads it each
 * frame. A module singleton instead of Zustand so per-frame joystick updates
 * never churn React/the store.
 *
 * Convention matches keyboard movement: y = forward(+)/back(-), x = right(+)/
 * left(-), each in -1..1, magnitude (0..1) = analog push amount.
 */
export interface MoveVector {
  x: number
  y: number
}

export const walkInput: { move: MoveVector } = { move: { x: 0, y: 0 } }

export function setWalkMove(x: number, y: number): void {
  walkInput.move.x = x
  walkInput.move.y = y
}

export function resetWalkMove(): void {
  walkInput.move.x = 0
  walkInput.move.y = 0
}

/**
 * Map a joystick thumb offset (px, screen coords with y-down) to a move vector.
 * `radius` is the joystick's max travel in px; `deadZone` is a fraction (0..1)
 * of the radius below which input is ignored. Screen-down y is flipped so
 * pushing up = forward (+y). Magnitude is clamped to 1.
 */
export function normalizeJoystick(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
): MoveVector {
  const dist = Math.hypot(dx, dy)
  if (dist < radius * deadZone) return { x: 0, y: 0 }
  const capped = Math.min(dist, radius)
  const mag = capped / radius
  const ux = dx / dist
  const uy = dy / dist
  return { x: ux * mag, y: -uy * mag }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/scene/walkInput.test.ts`
Expected: PASS (3 + 2 assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/scene/walkInput.ts src/scene/walkInput.test.ts
git commit -m "feat(walk): shared move-vector singleton + joystick normalization"
```

---

### Task 2: Feed the move vector into FirstPersonCamera movement

**Files:**
- Modify: `src/scene/cameras/FirstPersonCamera.tsx` (imports; `useFrame` movement block ~lines 196-242; spawn effect cleanup ~line 166)

**Note:** No unit test — movement is inside `useFrame` (R3F). Covered by the Task 1 unit test (vector math) + the Task 5 visual verification. This is the documented exception: a green suite can't prove the rendered walk feels right.

- [ ] **Step 1: Add the import**

At the top of `src/scene/cameras/FirstPersonCamera.tsx`, after the existing local imports, add:

```ts
import { resetWalkMove, walkInput } from '../walkInput'
```

- [ ] **Step 2: Fold the joystick vector into movement**

In the `useFrame` callback, the block currently reads the keyboard into `dx`/`dz` (the `if (forward)…if (left)…` chain ending before `if (dx !== 0 || dz !== 0)`). Replace the movement-accumulation + apply block so the joystick adds analog contribution and scales speed by push magnitude. Find:

```ts
    let dx = 0,
      dz = 0
    if (forward) {
      dx += dir.x
      dz += dir.z
    }
    if (back) {
      dx -= dir.x
      dz -= dir.z
    }
    if (rightKey) {
      dx += right.x
      dz += right.z
    }
    if (left) {
      dx -= right.x
      dz -= right.z
    }

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz)
      const stepDt = Math.min(dt, 0.05)
      const speed = crouching ? SNEAK_SPEED : WALK_SPEED
      dx = (dx / len) * speed * stepDt
      dz = (dz / len) * speed * stepDt
      const from: [number, number] = [camera.position.x, camera.position.z]
      const to: [number, number] = [from[0] + dx, from[1] + dz]
      const next = resolveMovement(from, to, PLAYER_RADIUS, collisionWalls.current)
      camera.position.x = next[0]
      camera.position.z = next[1]
    }
```

Replace with:

```ts
    let dx = 0,
      dz = 0
    if (forward) {
      dx += dir.x
      dz += dir.z
    }
    if (back) {
      dx -= dir.x
      dz -= dir.z
    }
    if (rightKey) {
      dx += right.x
      dz += right.z
    }
    if (left) {
      dx -= right.x
      dz -= right.z
    }
    // Mobile joystick: y = forward/back along heading, x = strafe along right.
    const jv = walkInput.move
    dx += dir.x * jv.y + right.x * jv.x
    dz += dir.z * jv.y + right.z * jv.x

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz)
      // Analog: keyboard pushes len≈1 (full speed); joystick scales by how far
      // the thumb is pushed, capped at 1 so combined input never exceeds speed.
      const throttle = Math.min(1, len)
      const stepDt = Math.min(dt, 0.05)
      const speed = (crouching ? SNEAK_SPEED : WALK_SPEED) * throttle
      dx = (dx / len) * speed * stepDt
      dz = (dz / len) * speed * stepDt
      const from: [number, number] = [camera.position.x, camera.position.z]
      const to: [number, number] = [from[0] + dx, from[1] + dz]
      const next = resolveMovement(from, to, PLAYER_RADIUS, collisionWalls.current)
      camera.position.x = next[0]
      camera.position.z = next[1]
    }
```

- [ ] **Step 3: Treat joystick input as "moving" for head-bob**

Find:

```ts
    const moving = !!(forward || back || left || rightKey)
```

Replace with:

```ts
    const joystickMoving = Math.hypot(walkInput.move.x, walkInput.move.y) > 0.01
    const moving = !!(forward || back || left || rightKey) || joystickMoving
```

- [ ] **Step 4: Reset the move vector when leaving walk mode**

In the spawn `useEffect` (the one that sets `camera.position` and returns a cleanup calling `setNearbyDoor(null)`), add `resetWalkMove()` to the returned cleanup so a released-but-nonzero joystick can't drift the next session. Find:

```ts
    return () => {
      useStore.getState().setNearbyDoor(null)
      if (camera instanceof PerspectiveCamera && prevFov !== null) {
```

Replace with:

```ts
    return () => {
      useStore.getState().setNearbyDoor(null)
      resetWalkMove()
      if (camera instanceof PerspectiveCamera && prevFov !== null) {
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/scene/cameras/FirstPersonCamera.tsx
git commit -m "feat(walk): drive movement from joystick vector (analog speed)"
```

---

### Task 3: Touch drag-to-look in FirstPersonCamera (replaces Pointer Lock on touch)

**Files:**
- Modify: `src/scene/cameras/FirstPersonCamera.tsx` (the Pointer Lock `useEffect`, ~lines 108-138; add a touch constant near `LOOK_SENSITIVITY`)

**Note:** No unit test — DOM touch + R3F. Covered by Task 5 visual verification.

- [ ] **Step 1: Add a touch look-sensitivity constant**

After the `LOOK_SENSITIVITY` constant (~line 53) add:

```ts
/** Touch drag look sensitivity (rad per CSS px) — a touch unit. */
const TOUCH_LOOK_SENSITIVITY = 0.005
/** True on touch-primary devices, where Pointer Lock is unavailable. */
const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
```

- [ ] **Step 2: Branch the look effect — touch drag vs pointer lock**

Replace the entire Pointer-Lock `useEffect` (the block starting with the `// Mouse-look via Pointer Lock:` comment through its closing `}, [gl])`) with:

```ts
  // Look-around input. On touch devices Pointer Lock is unavailable, so a drag
  // on the canvas spins the view (tracked by touch identifier so it's
  // independent of the joystick thumb). On desktop, Pointer Lock is used: click
  // the scene to capture the cursor, then mouse movement spins the view.
  useEffect(() => {
    const dom = gl.domElement
    const clampPitch = (p: number) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p))

    if (IS_COARSE_POINTER) {
      let lookId: number | null = null
      let lastX = 0
      let lastY = 0
      const onTouchStart = (e: TouchEvent) => {
        if (lookId !== null) return
        // A touch that lands on the canvas (not a UI control) becomes the look
        // drag. The joystick stops propagation, so its touches never arrive here.
        const t = e.changedTouches[0]
        if (!t) return
        lookId = t.identifier
        lastX = t.clientX
        lastY = t.clientY
      }
      const onTouchMove = (e: TouchEvent) => {
        if (lookId === null) return
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== lookId) continue
          yaw.current -= (t.clientX - lastX) * TOUCH_LOOK_SENSITIVITY
          pitch.current = clampPitch(pitch.current - (t.clientY - lastY) * TOUCH_LOOK_SENSITIVITY)
          lastX = t.clientX
          lastY = t.clientY
          e.preventDefault()
        }
      }
      const onTouchEnd = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === lookId) lookId = null
        }
      }
      dom.addEventListener('touchstart', onTouchStart, { passive: true })
      dom.addEventListener('touchmove', onTouchMove, { passive: false })
      dom.addEventListener('touchend', onTouchEnd)
      dom.addEventListener('touchcancel', onTouchEnd)
      return () => {
        dom.removeEventListener('touchstart', onTouchStart)
        dom.removeEventListener('touchmove', onTouchMove)
        dom.removeEventListener('touchend', onTouchEnd)
        dom.removeEventListener('touchcancel', onTouchEnd)
      }
    }

    const isLocked = () => document.pointerLockElement === dom
    const onClick = () => {
      if (!isLocked()) void dom.requestPointerLock()
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked()) return
      yaw.current -= e.movementX * LOOK_SENSITIVITY
      pitch.current = clampPitch(pitch.current - e.movementY * LOOK_SENSITIVITY)
    }
    const onLockChange = () => {
      if (!isLocked()) pressed.current = {}
      dom.style.cursor = isLocked() ? 'none' : 'grab'
    }
    dom.style.cursor = 'grab'
    dom.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('pointerlockchange', onLockChange)
    return () => {
      dom.style.cursor = ''
      dom.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
      if (document.pointerLockElement === dom) document.exitPointerLock()
    }
  }, [gl])
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/scene/cameras/FirstPersonCamera.tsx
git commit -m "feat(walk): touch drag-to-look (replaces Pointer Lock on touch devices)"
```

---

### Task 4: WalkJoystick overlay component + styles

**Files:**
- Create: `src/ui/walk/WalkJoystick.tsx`
- Modify: `src/styles/screens.css` (append walk-joystick rules)
- Modify: `src/App.tsx` (import + mount next to `<Crosshair />` ~line 504)

**Note:** No unit test — interactive DOM gesture. Covered by Task 5 visual verification.

- [ ] **Step 1: Create the component**

```tsx
import { useRef, useState } from 'react'
import { useStore } from '../../state/store'
import { normalizeJoystick, resetWalkMove, setWalkMove } from '../../scene/walkInput'

const RADIUS = 56 // px, max thumb travel from centre
const DEAD_ZONE = 0.18 // fraction of RADIUS

const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/**
 * Translucent analog movement joystick for walk mode on touch devices. Writes a
 * normalized move vector to the walkInput singleton (read by FirstPersonCamera).
 * Stops pointer/touch propagation so its gestures never reach the canvas
 * drag-to-look. Bottom-left, with safe-area insets.
 */
export function WalkJoystick() {
  const cameraMode = useStore((s) => s.cameraMode)
  const baseRef = useRef<HTMLDivElement>(null)
  const activeId = useRef<number | null>(null)
  const [thumb, setThumb] = useState({ x: 0, y: 0 })

  if (cameraMode !== 'firstPerson' || !IS_COARSE_POINTER) return null

  const center = () => {
    const r = baseRef.current?.getBoundingClientRect()
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { cx: 0, cy: 0 }
  }

  const update = (clientX: number, clientY: number) => {
    const { cx, cy } = center()
    const dx = clientX - cx
    const dy = clientY - cy
    const v = normalizeJoystick(dx, dy, RADIUS, DEAD_ZONE)
    setWalkMove(v.x, v.y)
    // Visual thumb: clamp to radius (screen y-down, matches the raw offset).
    const dist = Math.hypot(dx, dy)
    const k = dist > RADIUS ? RADIUS / dist : 1
    setThumb({ x: dx * k, y: dy * k })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    activeId.current = e.pointerId
    baseRef.current?.setPointerCapture(e.pointerId)
    update(e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return
    e.stopPropagation()
    update(e.clientX, e.clientY)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return
    e.stopPropagation()
    activeId.current = null
    resetWalkMove()
    setThumb({ x: 0, y: 0 })
  }

  return (
    <div
      ref={baseRef}
      className="walk-joystick"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="walk-joystick-thumb"
        style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Append styles**

Append to `src/styles/screens.css`:

```css
/* Walk-mode mobile movement joystick (translucent, bottom-left, safe-area). */
.walk-joystick {
  position: absolute;
  left: calc(env(safe-area-inset-left, 0px) + 24px);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 28px);
  z-index: 20;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  background: color-mix(in oklab, var(--surface) 35%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
}
.walk-joystick-thumb {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: color-mix(in oklab, var(--accent) 65%, transparent);
  border: 1px solid color-mix(in oklab, var(--text) 25%, transparent);
  pointer-events: none;
}
```

- [ ] **Step 3: Mount in App**

In `src/App.tsx`, add the import alongside the other `ui` imports (near the `Crosshair` import line 23):

```ts
import { WalkJoystick } from './ui/walk/WalkJoystick'
```

Find `<Crosshair />` (~line 504) and add the joystick directly after it:

```tsx
        <Crosshair />
        <WalkJoystick />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run check`
Expected: tsc clean; Biome reports no new errors on the changed files.

- [ ] **Step 5: Commit**

```bash
git add src/ui/walk/WalkJoystick.tsx src/styles/screens.css src/App.tsx
git commit -m "feat(walk): translucent analog joystick overlay for touch walk mode"
```

---

### Task 5: Visual verification (REQUIRED by CLAUDE.md)

**Files:** none (verification only). Read `docs/visual-verification-playbook.md` first.

- [ ] **Step 1: Build/typecheck/tests gate**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; all tests pass (incl. `walkInput.test.ts`).

- [ ] **Step 2: Capture walk mode with the joystick**

Start the dev server, then drive the store into walk mode and screenshot with a touch-sized viewport. Because `IS_COARSE_POINTER` is read at module load, the screenshot harness must emulate a touch device (Puppeteer `page.emulate` of a mobile device, or set `hasTouch` + a coarse-pointer media override) so the joystick mounts. Use `window.__store.getState().setCameraMode('firstPerson')`.

Run (adapt to the playbook's evalFile template):
`node scripts/shot.mjs /tmp/walk-joystick.png 1500 <evalFile-that-sets-firstPerson>`

Expected: a screenshot showing the translucent joystick bottom-left over the first-person view.

- [ ] **Step 3: Exercise joystick + look-drag via actions**

Use `scripts/shot.mjs` actions to (a) drag on the joystick (a `drag`/`rdrag` starting inside the bottom-left joystick rect) and confirm the camera position advances, and (b) drag elsewhere on the canvas and confirm the view yaw/pitch changes. Capture before/after screenshots.

- [ ] **Step 4: Confirm no desktop regression**

With a normal (fine-pointer) viewport, screenshot walk mode and confirm the joystick is absent and Pointer-Lock click-to-look still works (cursor `grab`, crosshair present).

- [ ] **Step 5: Visually review**

Open each PNG and confirm: joystick renders translucent and correctly placed; thumb tracks the drag; movement advances the camera; look-drag rotates the view; desktop unaffected. Report what was observed in the screenshots (not just that they were taken).

---

### Task 6: Update docs (REQUIRED by CLAUDE.md)

**Files:**
- Modify: `CLAUDE.md` (walk-mode / mobile sections)
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md**

In the walk-mode / `body.mobile` discussion, note: on coarse-pointer devices walk mode uses **touch drag-to-look** (Pointer Lock is desktop-only) plus a **translucent analog joystick** (`src/ui/walk/WalkJoystick.tsx`) that writes a move vector to `src/scene/walkInput.ts`, read by `FirstPersonCamera`'s `useFrame`. Gated on `(pointer: coarse)`, so tablets get it too — not just `≤640px`.

- [ ] **Step 2: Update README.md**

Add a one-line mention under the walk-through / mobile feature notes: mobile/tablet walk mode supports on-screen joystick movement + drag-to-look.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: note mobile walk-mode joystick + drag-to-look"
```

---

## Self-review notes

- **Spec coverage:** detection (Task 3 `IS_COARSE_POINTER`, Task 4 gating), drag-to-look (Task 3), joystick HUD (Task 4), analog speed (Task 2 `throttle`), input plumbing singleton (Task 1), reset-on-leave (Task 2 Step 4), unit test of normalization (Task 1), visual verification (Task 5), docs (Task 6). All covered.
- **Type consistency:** `setWalkMove`/`resetWalkMove`/`normalizeJoystick`/`walkInput.move` names match across Tasks 1, 2, 4. `MoveVector` `{x,y}` shape consistent. Convention y=forward / x=right used identically in `normalizeJoystick` and the camera fold.
- **No placeholders:** every code step has full code; commands have expected output.

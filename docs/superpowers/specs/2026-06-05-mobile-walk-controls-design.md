# Mobile walk-mode controls — design

## Problem

Walk mode (`FirstPersonCamera`) looks around using the **Pointer Lock API**,
which browsers block on touch devices. On phones/tablets the user therefore
cannot look around at all, and there is no on-screen movement input (movement
is keyboard WASD only). Result: walk mode is effectively unusable on touch.

## Goals

- Let touch users **look around** in walk mode by dragging on the scene.
- Give touch users an on-screen **translucent joystick** to move around, with
  **analog speed** (push further = faster, up to the existing walk speed).
- Leave desktop keyboard + pointer-lock behaviour completely unchanged.

## Non-goals (YAGNI)

- Jump / crouch / run on-screen buttons.
- Haptics, gesture-based door opening, tap-to-open. (Door aiming already works;
  can be added later.)
- Persisting any walk input to the store.

## Detection

Gate the touch controls on **touch capability**, not screen width:
`window.matchMedia('(pointer: coarse)')`. A tablet in walk mode also cannot use
Pointer Lock, so width (`body.mobile`, ≤640px) is the wrong axis. Phones and
tablets both get the controls; a desktop with a fine pointer never does.

## Part 1 — Touch drag-to-look (`src/scene/cameras/FirstPersonCamera.tsx`)

- Detect coarse pointer once. When **true**, skip the existing pointer-lock
  setup entirely and instead attach `touchstart` / `touchmove` / `touchend`
  (passive: false where preventDefault is needed) to the canvas
  (`gl.domElement`).
- A drag whose `touchstart` target is **not** a UI control (i.e. lands on the
  canvas) becomes the **look** touch. Record its `touch.identifier`.
- On `touchmove` for that identifier, apply the delta to the existing `yaw` /
  `pitch` refs — same model as the current `mousemove` handler, with a
  touch-tuned sensitivity constant (rad per CSS pixel). Pitch stays clamped as
  today.
- On `touchend` / `touchcancel` for that identifier, release the look touch.
- The desktop pointer-lock + `mousemove` path is left intact and is the
  fallback when the pointer is **fine**.

## Part 2 — Translucent joystick HUD (`src/ui/walk/WalkJoystick.tsx`, new)

- A DOM overlay rendered in `App.tsx` next to `Crosshair`. Visible only when
  `cameraMode === 'firstPerson'` **and** the device is coarse-pointer.
- Bottom-left, with iOS safe-area insets. Translucent circular base + draggable
  thumb, styled with design-system tokens (`src/styles/`), not hardcoded
  colours. New rules go in an appropriate styles file (e.g. `screens.css` or a
  small walk section).
- Uses pointer events scoped to its own element so its touch is independent of
  the look-drag (multi-touch: one thumb moves, one thumb looks).
- Produces a normalized 2D vector `{ x, y }` in −1..1; magnitude = push amount,
  capped at 1.

## Input plumbing (`src/scene/walkInput.ts`, new)

- A tiny module-level mutable singleton holding the current move vector
  `{ x, y }` (and a reset helper). The joystick (DOM world) **writes** it; the
  camera (R3F canvas world) **reads** it each `useFrame`. This decouples the two
  trees without pushing per-frame updates through Zustand.
- In `FirstPersonCamera`'s `useFrame`, fold the move vector into the **same**
  forward/right movement math that WASD already feeds:
  - `y` → forward/back along the camera forward vector,
  - `x` → strafe along the right vector,
  - speed = `walkSpeed * magnitude` (analog), clamped to the existing
    `2.1 m/s`. Collision / head-bob / gravity paths are unchanged.
- Joystick and keyboard can coexist; if both contribute, sum then clamp.
- Reset the move vector to zero when leaving walk mode / on joystick release so
  the player doesn't drift.

## Testing

- Unit: pure normalization of joystick offset → vector (clamp to unit circle,
  dead-zone), and any pure helper extracted from the look-delta math.
- Visual verification (required by CLAUDE.md): run the app, emulate a
  coarse-pointer / mobile viewport, enter walk mode, drive the joystick + a
  look-drag via `scripts/shot.mjs` actions, capture screenshots, and visually
  review for correct joystick rendering, look response, and no regression to
  desktop walk mode.

## Docs

Update `CLAUDE.md` (walk-mode / mobile sections) and `README.md` to note the
mobile walk controls, per the repo's keep-docs-current rule.

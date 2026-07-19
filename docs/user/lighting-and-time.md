# Lighting & time of day

The flat is lit by a real **sun simulation**. The sun's position is computed from
your location and the time of day, and it drives the shadows, the sky, and the
ambient light.


## Changing the time

- Press <kbd>T</kbd> to cycle through the presets — **morning → noon → dusk →
  night** (and back to following the system clock).
- Or open the **Scene** menu in the toolbar for the presets plus a **sun‑direction
  compass** to aim the sun yourself *(Pro mode — the compass is hidden in Simple)*.

As you move through the day the directional sunlight, shadow length, sky colour,
and overall exposure all shift — interiors go warm at dusk and dark at night.

## Render presets

The Scene menu's **Render presets** row sets the whole mood in one tap — **Bright
day**, **Soft morning**, **Golden hour** or **Cozy evening** — each combining a
time of day, a tone-mapping look, exposure and the light-fixture state. Tweak
anything afterwards; the preset is just a starting point.

## Environment lighting (HDRI) *(Pro)*

The Scene menu's **Environment lighting** picker lets you light the flat with a
real **captured HDRI** instead of the built-in procedural light — pick **Neutral
studio**, **Warm studio**, **Clear sky**, **Golden hour** or **Soft dawn** for a
different mood and set of reflections. These are free CC0 environments from Poly
Haven and need a higher graphics tier (Medium or above) to show. Leave it on
**Procedural (default)** to keep the standard look. *(Pro mode; hidden in Simple.)*

## Light fixtures

Lamps, pendants, and ceiling lights **glow and cast light at night**, and fade
out in daylight. You control this with the **Lights** toggle in the toolbar:

- **Auto** — fixtures follow the day/night cycle (on at night, off in day).
- **On** — force fixtures on (useful for a windowless room in daylight).
- **Off** — keep them dark.

## Lighting mood presets

Right below Lights, the Scene menu's **Mood** row sets a scene-wide brightness +
colour-temperature mood for every lit fixture in one tap:

- **Normal** — no adjustment (the reset).
- **Reading** — bright, crisp task light.
- **Movie** — dim and warm; ceiling lights dim harder than lamps, for a
  cinema-like room.
- **Party** — bright and warm, a sociable wash for guests.
- **Romantic** — low and warm, with the ceiling fixtures nearly off.

A mood layers on top of the Lights toggle above (it never turns a light on or
off by itself) and never re-lights a fixture you've switched off yourself.

> **Example — a cosy evening**
> 1. Press <kbd>T</kbd> until the scene reads as dusk / night.
> 2. Set the Lights toggle to **On**.
> 3. Orbit down to eye level (or switch to [Walk](/walkthrough-and-sun-study)) to
>    see the lamps glow.

### Turn any item into a light

Not just lamps: select **any** placed piece and tap the **light** icon in the
inspector header to make it **emit light at night** (tap again to turn it back
off) — handy for a glowing shelf, a display cabinet, or a feature piece.

**Photometric beams (Pro).** For a light‑emitting item, the inspector's
**Photometry (IES)** picker drives it with a real luminaire **.ies** beam shape,
so a downlight or wall‑washer throws the same pool and spread as its real‑world
fixture.

## Daylight through windows

Two effects shape how the sun enters a room, both automatic:

- **Window glass tint** — a window's **glass tint** colour (set on the window in
  the [floor‑plan editor](/floor-plan-editor)) can **colour the sunlight** that
  passes through it, so tinted glazing warms or cools the light it lets in.
- **Curtains dim the sun** — **draw a room's curtains or blinds** and they
  attenuate the sunlight coming through that window, softening the interior just
  like real fabric.

## A live sky in the window (Pro)

In [walk mode](/walkthrough-and-sun-study) you choose what's seen through the
windows from the **Scene** menu's **Window view (walk mode)** picker (photo
backdrops are covered in [Navigating](/navigating#the-window-view-walk-mode)).
**(Pro)** Pick **Sky** there — also on ⌘K as **Backdrop — Sky** — for a
sun‑driven procedural sky that **tracks your current time of day**, brightening at
noon and reddening at dusk to match the interior light.

## Furniture in motion

The **Scene** menu's **Motion** toggle animates moving parts — spinning
**ceiling‑fan blades** and the like — so the flat feels alive; turn it off for a
still scene.

## Render camera lens (Pro)

When you shoot an [HQ render](/navigating#hq-render), the render dialog exposes
**focal length**, **aperture (f‑stop)** and **focus** controls, so you can frame
with a chosen lens and throw the background out of focus with a shallow depth of
field.

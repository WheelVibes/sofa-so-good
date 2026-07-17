# Navigating the flat

There are two ways to look around: an **orbit** (dollhouse) view and a
first‑person **walk**. Toggle between them with <kbd>V</kbd>. **Both are
view‑only** — they're for *looking*, not editing. Switch the camera between
orbit and walk from the toolbar's **View** menu (which also holds the framing
shortcuts below). All furnishing and customizing happens inside the
[per‑room editor](/room-editor) (open it from the toolbar **Edit** menu →
**Edit a room**, or just **click a room's floor** in the overview — you'll be
asked *"Enter &lt;room&gt;?"* first so you never dive in by accident).


## Orbit view

The default. You look at the whole flat from outside and above — a calm
dollhouse view for getting your bearings and presenting the design.

- **Drag** to orbit around the flat.
- **Scroll** to zoom in and out.
- **Right‑drag** (or <kbd>Shift</kbd> + two‑finger scroll) to pan.
- **Click a room's floor** to dive into the per‑room editor for that room
  (you'll confirm *"Enter &lt;room&gt;?"* first).
- Exterior walls between you and the interior fade out automatically so you can
  always see inside.

The **nav cluster** at the bottom‑right combines a compass (click to reorient),
a zoom rail, and a minimap. While inside the per‑room editor with something
selected, the zoom rail also grows a **Frame selection** button — click it (or
press <kbd>Z</kbd>) to dolly the camera in so the selected piece(s) fill the
view, keeping your current viewing angle.

## Quick view shortcuts

**Top view** and **Reset view** (in the **View** menu, or the shortcuts below)
automatically zoom to fit — they centre the flat and frame it so the whole home
just fills the screen, adapting to your window size. **Frame selection** does
the same for just the item(s) you've selected.

| Action | Shortcut |
| --- | --- |
| Top‑down plan view (fit) | <kbd>O</kbd> |
| Reset to the 3/4 overview (fit) | <kbd>H</kbd> |
| Frame the current selection | <kbd>Z</kbd> |
| Switch orbit ⇄ walk | <kbd>V</kbd> |

### Parallel projection (Pro)

In **Pro** mode the **View** menu adds a **Parallel projection** toggle. It
switches the overview between the normal perspective camera and an
*orthographic* one — the classic architectural "dollhouse" look where parallel
walls stay parallel and nothing shrinks with distance, exactly like the
Parallel‑projection mode in SketchUp or Sweet Home 3D. It's great for clean,
plan‑like hero shots and for judging proportions without perspective
distortion. Toggling it keeps your current viewpoint, and you still orbit, pan
and zoom the same way. Turn it off to return to perspective.

### Vertical lock (Pro)

Also in the **View** menu, **Vertical lock** keeps a building's **vertical lines
parallel** when the camera is pitched up or down, instead of letting them converge
— the classic two‑point‑perspective look architects use so walls don't appear to
lean. Great for a clean, upright hero shot.

## Walk mode

Switch to walk (<kbd>V</kbd>) to feel the real scale of the flat at eye level.
When you enter, a small **controls banner** fades in at the bottom of the screen
with the right hints for your device, then fades away after a few seconds.

![Walking through the flat in first person](/screenshots/walk.png)

**Tap or click a spot on the minimap** (bottom‑right) to jump straight there — handy
for crossing the whole flat without walking the distance, especially on a phone.

### On a computer (mouse + keyboard)

1. Press <kbd>V</kbd> to enter walk mode.
2. **Click the scene once** to capture the mouse, then **move the mouse** to look
   around. Move with <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>.
3. Walk up to a door and press <kbd>E</kbd> to open or close it.
4. Press <kbd>Esc</kbd> to release the mouse, or <kbd>V</kbd> to return to orbit.

> Your browser shows its own *"Press Esc to show your cursor"* notice while the
> mouse is captured. That bar is part of the browser (a privacy safeguard for
> hidden-cursor modes) and can't be restyled — it disappears on its own after a
> moment, and <kbd>Esc</kbd> always brings your cursor back.

### On a phone or tablet (touch)

There's no mouse to capture, so walk mode switches to touch controls:

- A translucent **joystick** appears at the bottom‑left — drag it to move.
- **Drag anywhere else** on the scene to look around.
- Open the menu → **View** → **Orbit** to return to the overview.

You're bounded by the walls — an open door is a gap you can walk through, a
closed one isn't.

### Walk camera settings

While you're in walk mode, open the **Appearance** popover (top‑right of the
toolbar) and it grows a **Walk settings** section with two sliders:

- **Field of view** (50°–100°) — how wide a view you see. A lower value zooms in
  (a tighter, more telephoto look); a higher value gives a wide‑angle view that
  takes in more of the room at once. Default 70°.
- **Eye height** (1.2 m–1.9 m) — how high you stand. Lower it to see the space as
  a child would, or raise it for a taller observer. Default 1.6 m. (Shown in feet
  and inches if you've set imperial units.)

Both apply instantly and are remembered on your device.

### The window view (walk mode)

What you see through the windows is a **backdrop** you can pick from the **Scene**
menu's **Window view (walk mode)** picker — a photographic **city / dusk / …**
panorama that sits realistically beyond the glass. Prefer your own outlook?
**Upload your own photo** as the window view from the same picker. (For a live,
time‑of‑day **Sky** backdrop, see
[Lighting & time](/lighting-and-time#a-live-sky-in-the-window-pro).)

### Enter VR (Pro)

On a supported WebXR headset, **View → Enter VR** drops you into an immersive
**room‑scale walkthrough** of your flat — look and move around your design at true
scale in VR.

## HQ render

**File → HQ render** (also on ⌘K as **HQ render (path‑traced)**) produces a
**photoreal still** of the current view — a progressive path‑traced image that
refines as it goes, with soft shadows, accurate reflections and realistic light
bounce. An **AI denoise** pass cleans up the result for a smooth, noise‑free final
image. (Lens and depth‑of‑field controls are in
[Lighting & time](/lighting-and-time#render-camera-lens-pro).)

## Before / after reveal (Pro)

**File → Before / after** compares the **empty room** with your **furnished
design** on a **draggable divider** — slide it across to reveal how far the space
has come, a compelling way to show off a design.

## Saved views & presentation (Pro)

**View → Save current view** bookmarks the camera angle you're at (with the
lighting at that moment), so you can jump back to it from the same menu. Each
saved view row has three small buttons:

- **360°** — present this view as an interactive panorama slide (see below).
- The **note** button — add a presenter note, shown as the slide's caption.
- The **trash** button — delete the view (asks you to confirm).

**View → Cinematic tour** flies the camera smoothly through your saved views in
order (no recording). **View → Record walkthrough video** does the same flight
and captures it: it asks for the total video length, then flies the tour and
downloads the clip when it ends (an MP4 where your browser supports it, otherwise
a WebM). Both need at least two saved views.

**View → Render all views** flies through every saved view in turn and downloads
a high-quality PNG of each — a one-click way to export a whole set of presentation
images at once (named so they sort in saved-view order).

**View → Present…** turns your saved views into a full-screen client slideshow:
each slide flies the camera to its view (restoring that view's lighting) and
captions it with the view's name and note. Navigate with the on-screen arrows,
<kbd>←</kbd>/<kbd>→</kbd> or <kbd>Space</kbd>; **Auto ▶** advances every few
seconds; <kbd>Esc</kbd> exits.

### 360° slides

Mark a saved view **360°** and presenting it becomes a look-around moment: when
the slide is reached, the app captures a full panorama from that spot (a brief
*Capturing 360°…* notice) and you — or the client — can **drag to look around
and scroll to zoom**, exactly like the [360° panorama](/design-tools#360-panorama-pro)
viewer. Auto-advance **pauses on 360° slides** so nobody is yanked away
mid-look — move on with Next, an arrow key, or <kbd>Space</kbd>, and the timer
resumes on the next regular slide.

# Finishes & materials

## Repaint a wall or refinish the floor

1. Inside the [per‑room editor](/room-editor), click any **wall** or the **floor**.
2. The **finish picker** opens with the available finishes. Use the **search box**
   to filter by name, and the **Recently used** row to re‑apply a finish you just
   used (handy for the same floor across bedrooms).
3. Choose the surface with the **Floor · Walls · Ceiling** tabs at the top of the
   picker — each surface has its own tab so they never get muddled together.
4. Pick a finish — it applies instantly to that surface (floors are per‑room).
   **Apply floor / walls to all rooms** repeats it everywhere in one click.
5. On the **Ceiling** tab, paint a room's ceiling from the same palette, **Apply
   ceiling to all rooms**, or **Reset ceiling to white** to go back to the plain
   default.
6. **Accent walls** — click any single wall in the 3D view to paint it a different
   colour from the rest of the room. The **Walls** tab lists this room's accent
   walls under **Accent walls**, where you can remove one (match it back to the
   room) at a tap.

This works the same on a **custom floor plan** (a template or one you drew
yourself): each plan room takes its own floor and wall finish, live in 3D, and
the picks are saved with the plan.

![The finish picker open on a room](/screenshots/finish-picker.png)

## Recolour any finish — colour and texture are independent

Colour, texture/pattern, and material behave as separate, mix‑and‑match choices:

- **Pick a custom colour and keep the texture.** With a wood, tile, brick — or a
  downloaded Poly Haven / ambientCG — finish applied, choosing a **Custom
  colour** (or a palette / recent colour) *repaints* that finish: the grain,
  pattern and surface relief stay, only the colour changes. It can lighten as
  well as darken — dark walnut really does become a light‑grey wood. Only
  plain paints (plaster / flat colours) stay simple flat paint.
- **Swap the texture and keep the colour.** While a colour override is active,
  tapping a different finish swatch re‑applies *your colour* on the new
  texture. A **Colour override** chip appears under the surface's header —
  press its **×** (or re‑tap the highlighted swatch) to go back to the
  finish's original colours.
- **Fine‑tune the material.** **Compose your own…** adds a **Scale** slider
  (tile size) and a **Gloss** slider (matte → polished) on top of any
  texture + colour combination. For photo textures it also offers two colour
  modes: **Repaint** (the default — true recolour, keeps the pattern) and
  **Shade** (darken‑only wash, the old behaviour).
- **Works with your own textures too.** Any texture you
  [upload](/importing-textures) can be repainted with any colour from the
  apartment palette — upload a black‑and‑white pattern once and reuse it in
  every colourway.

**Save a custom material.** Happy with a composed / tinted finish? Press **Save
material** in **Compose your own…** to name it and keep it — it appears as a
reusable swatch in that surface's picker grid, ready to apply anywhere (remove it
later with its **×**).

## Apartment colour palette & presets

The finish picker's **Apartment colour palette…** section sets a master palette
of up to 5 colours for the whole home — every colour picker then offers it as a
swatch row plus **Recommended blends** (harmony suggestions). Tick **Override
palette for this room** to give one room its own palette.

In **Pro** mode, **Palette presets** offers one-click curated themes
(Scandinavian calm, Japandi, Terracotta warmth, Coastal breeze, and more) — tap
a card to apply it to the palette you're editing. Applying a preset is undoable.

## Drag a swatch to apply (desktop)

On desktop you can also **drag a swatch out of the finish picker and drop it**:

- **Onto the 3D room itself** — drop on the **floor** to refinish the floor, on a
  **wall** to repaint that room's walls, or on a **piece of furniture** to restyle
  that piece. Whatever is under your cursor when you release gets the finish.
- **Onto a row in the Objects list** (the Layers tab of the catalog drawer) to
  restyle that piece without aiming in 3D.

A drop is a single undo step — <kbd>Ctrl/⌘&nbsp;Z</kbd> reverts it. Dropping on
empty sky does nothing. On touch devices drag‑and‑drop isn't available; tap a
swatch to apply it instead.

## Built‑in finishes

Finishes are generated procedurally, so they tile at a fixed real‑world scale no
matter how big the surface is:

- **Floors & walls** — wood planks, **parquet** (basketweave) and **herringbone**
  (premium 45° interlocking planks, in oak or walnut), square tile, **hexagon
  tile** (honeycomb), marble, carpet, concrete, terrazzo, plaster.
- **Wall treatments** — wallpapers (stripe / grasscloth), checker, exposed brick,
  glossy **subway / metro tile** (kitchen backsplash + bathroom), and **fluted /
  reeded panels** (oak / walnut / plaster feature walls), plus a **wall accent**
  picker for a single feature wall.

## Browse the online library *(Pro)*

Click **Browse** in the finishes panel to pull free CC0 textures from Poly Haven
and ambientCG. The **Browse** button is a **Pro-mode** feature — switch to Pro
from the Appearance popover to show it (in Simple mode the finishes panel keeps
just the built-in palette + **Upload**):

- It opens **pre‑filtered to the surface you're editing** — refinishing a floor
  shows floor textures first. Use the **All surfaces / Floor / Wall** chips to
  switch, and the provider chips (All / Poly Haven / ambientCG) to narrow source.
- Each card shows its **download size** at the chosen resolution (1K / 2K / 4K)
  before you tap, so you can avoid pulling a large texture on a slow connection —
  heavy downloads are flagged in amber.

## Materials on furniture (CC0 DLC)

You can apply a real PBR material — including a CC0 set downloaded from Poly Haven
or ambientCG — directly to a piece of furniture. In a selected item's inspector,
the wood / surface **finish** dropdown lists these as **"CC0 DLC"** options; pick
one and the piece re‑renders with that material. Below the dropdown, a **Quick
finishes** row offers common woods + marble (oak, walnut, teak, ash, ebony,
marble) as one‑tap swatches, and **Apply finish to all** copies the piece's
finish to every other item of the same type.

## Ceilings, floor texture & trim

A few finishing touches shape the surfaces beyond a flat colour:

- **Ceiling design (Pro)** — give a room a **Tray**, **Coffered** or **Dropped**
  ceiling shape (distinct from the flat **Ceiling** finish tab, which only paints
  it). Select a room in the **2D [floor‑plan editor](/floor-plan-editor)** and use
  the **Ceiling** style picker in its inspector to pick the treatment and its
  parameters.
- **Floor texture scale & angle** — in the same room inspector, **Tile size (×)**
  and **Angle (°)** scale and rotate a room's floor texture, so a plank or tile
  pattern runs the way you want and reads at the right size.
- **Crown molding** — a decorative trim strip is drawn automatically at the
  **wall–ceiling junction**, with mitre‑cut corners, for a more finished room.

## Tidy up a room

The finish picker includes a **Tidy up room** button that auto‑arranges the
furniture in the current room against the interior‑design rules (storage and
beds flush to walls, seating facing the TV, walkways kept clear).

> **Example — a marble living room with a feature wall**
> 1. Click the living‑room floor → choose a marble finish.
> 2. Click the TV wall → open the wall accent picker → pick a feature finish.
> 3. Click **Tidy up room** to re‑square everything.

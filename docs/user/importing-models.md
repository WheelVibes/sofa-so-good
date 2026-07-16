# Importing models

Bring your own 3D furniture into the flat with the **Upload model** dialog. Every
import runs entirely **in your browser** — nothing is uploaded to a server.


## Supported formats

- Native: **`.glb`** / **`.gltf`**
- Converted to GLB in your browser on import: **`.obj`**, **`.fbx`**, **`.stl`**,
  **`.ply`**, **`.dae`**, **`.3ds`**, **`.3mf`**, **`.usdz`**

> **Multi‑file formats** (e.g. an `.obj` with its `.mtl` and texture images) need
> their sibling files included in the same drop, or the materials won't resolve.

## What happens on import

1. Non‑GLB models are **converted to GLB** in the browser.
2. Every model runs through an **optimize pass** — weld / dedup / prune, Draco
   geometry compression, and WebP textures — so it loads fast in the scene.
3. By default, low‑detail versions are also generated (the **Generate low‑detail
   versions for slower devices** checkbox): simplified copies with smaller
   textures that the **Performance** and **Medium** graphics tiers load instead
   of the full model. Untick it to make big imports finish faster — the full
   model is then used on every tier.
4. There's an opt‑in **Maximum compression (KTX2)** toggle for GPU‑compressed
   textures; if KTX2 encoding isn't available it falls back to WebP.

## Importing

1. Open the **Upload model** dialog from the catalog / toolbar.
2. **Drag and drop** loose files — or a whole folder — onto the drop zone, or use
   **Choose folder…**.
3. Pick a **Category** (leave it on **Auto** to auto‑detect; IKEA group folders
   keep their own detected category).
4. Import runs as a **background job** with a progress bar — you can close the
   dialog and keep working while it finishes.

IKEA model folders (a `metadata.json` plus `<finish>.glb` files) are
**auto‑detected** and imported as one catalog card per product, with selectable
finishes.

### Resize an imported model

Select it and use the **Scale** slider in the inspector — it shows the resulting
real‑world footprint in **centimetres** (not just a multiplier), and the range is
wide (0.25×–3×) so you can correct an upload or IKEA model that came in at the
wrong size.

### Make an uploaded mirror reflect

Select an imported model and turn on **Reflective surface (mirror)** in the
inspector. On the **High / Maximum** graphics tiers the model's largest flat face
becomes a true mirror that reflects the room (great for an uploaded mirror or
glass model). On lower tiers it stays a normal surface.

> **Worked example — an OBJ chair**
> 1. Select the chair's `.obj`, its `.mtl`, and all referenced texture images
>    together (drag them in as one selection or drop the containing folder).
> 2. Leave Category on **Auto**.
> 3. Import — the chair is converted to GLB, optimized, and appears in the
>    catalog ready to place.

## Design your own asset

No model to import? Open the **3D asset designer** (⌘K → "Design a 3D asset") to
build one in the browser:

- **Templates** — the fastest start: the **Templates** section offers ready-made pieces —
  **Dining table**, **Coffee table**, **Bookshelf**, **Cabinet**, **Bed frame** and **Sofa
  frame**. Tap one and a small panel opens with 2–4 dimension sliders (each shows its unit, the
  allowed range and a hint naming the standard — e.g. *"Standard dining height 0.75 m"*), and the
  **preview updates live** as you drag. The dimensions are clamped to sensible furniture sizes, so
  the proportions always look right. Tap **Use template** to drop its **editable parts** into your
  design — if the canvas is empty it *replaces* it, otherwise it's added **alongside** what's
  already there. It arrives as its own named **Group** (so you can move the whole piece), and every
  part is fully editable, so you can then recolour, resize, combine or ungroup it like anything you
  built by hand. **Cancel** backs out. It's one undo step.
- **Compose from shapes** — add boxes, cylinders, spheres, cones, pyramids, capsules,
  torus rings and wedges, then set each one's size, position, **rotation**, colour and **surface finish**
  (roughness, metalness, **glow** and **opacity** sliders — so a part can read as matte
  wood, polished metal, a lit neon/lamp, or translucent glass). A live 3D preview
  updates as you go.
- **Rounded edges** — boxes and wedges gain a **Corner radius** slider that softens their
  edges so they catch light like real furniture (0 = sharp).
- **More shapes** — below the primitives, a **Lathe / Extrude / Sweep** row adds
  profile-driven shapes:
  - **Lathe** revolves a 2D profile into turned legs, bowls, vases and columns — pick a
    **preset**, drag the profile points (or type X/Y), and set the number of **sides**.
  - **Extrude** turns a 2D outline (rounded rectangle, ellipse, L, T, arch) into a prism with
    a bevel on by default.
  - **Sweep** runs a cross-section (round piping, half-round, ogee moulding, rectangle) along
    a path (straight, L-corner, U-channel, ring) for railings, edging and mouldings.
- **Texture a shape** — each shape also has a **Texture** picker: choose **None — solid
  colour** (the default), tap a curated **Quick finishes** swatch (Oak, Walnut, Teak, Ash,
  Ebony, Marble), or pick any catalog / downloaded CC0 material from the dropdown — the
  same finishes you can apply to placed furniture. The texture defines the surface
  (its own roughness/metalness; those two sliders hide while one is set), while glow and
  opacity still apply on top; tap the active swatch (or pick None) to go back to the solid
  colour. Textures are baked into the saved asset, and a combined shape keeps each source
  shape's own texture on its own faces.
- **Finish presets** — under the texture picker, a grid of one‑tap **Finish presets** sets a
  realistic surface *feel* while keeping the shape's own colour: **Velvet**, **Satin**,
  **Leather**, **Lacquered wood**, **Oiled wood**, **Matte paint**, **Powder‑coat**, **Brushed
  steel**, **Polished chrome**, **Brass**, **Clear glass**, **Frosted glass**, **Ceramic** and
  **Rubber**. Tap one to apply it (the matching preset stays highlighted); it clears any texture so
  the finish shows. Open **Custom finish** to fine‑tune the raw sliders yourself — **Sheen** (the
  soft glow of velvet/satin), **Clearcoat** (a lacquer gloss film), **Transmission** (see‑through
  glass, with **Index of refraction** + **Thickness**) and **Anisotropy** (a brushed‑metal
  highlight, with a **Brush angle**). *Glass see‑through only shows in the preview on the
  High/Maximum graphics tiers, but it always exports correctly.*
- **Two‑tone gradient** — open **Gradient** and tap **Add two‑tone gradient** to fade the shape
  between two colours: pick the **Axis** (X/Y/Z) and the **From** / **To** colours. The gradient is
  baked into the shape and survives export. It's for solid‑colour shapes — if a texture is set, clear
  it first (the picker tells you).
- **Solid or Hole** — every shape's edit panel has a **Type** switch: **Solid** (the
  default) or **Hole**. A **Hole only cuts inside a Subtract combine** (below): once it's
  carving inside one it shows as a translucent ghost. On its own — before it's part of a
  Subtract — a Hole stays a plain solid and saves as one (the layers list tags it *Hole
  (inert)* to make that clear), so marking a shape as a Hole changes nothing until you
  combine it.
- **Drag it in the preview** — selecting a shape shows a 3D gizmo on it, with a
  **Move / Rotate / Scale** switch in the preview's corner (or press **G**, **R**, **S**).
  Drag the arrows/rings/handles to place the shape; when you let go, the numbers in the
  edit panel update (snapped to 5 mm and 1°), so you can still fine-tune by typing.
- **Start from an uploaded model** — pick one of your uploaded GLBs as the base and
  resize it to make a custom variant (optionally kit‑bashing extra shapes on top).
- **Combine (boolean)** — booleans are **non-destructive**: the shapes you combine stay
  fully editable and the result updates live as you move them. In the **Shapes** list, tap
  **Select** (or shift/⌘-click rows) to pick **two or more** shapes, then choose:
    - **Union** — merge them into one solid.
    - **Subtract** — carve holes out of solids. Shapes marked **Hole** are cut out of the
      solids; if you didn't mark any Hole, the **first** shape you selected is the base and
      the rest are carved out of it.
    - **Intersect** — keep only the overlap of all the shapes.

  Each combine appears under **Combined groups** with two actions: **Bake** (freeze the
  result into one editable shape — handy to then combine it with something else) and
  **Ungroup** (dissolve the combine; the shapes go back to how they were). A heavy combine
  briefly shows **Computing…** while it works. Tip: don't line shapes up so two faces sit
  *exactly* flush — overlap or offset them slightly so the cut doesn't flicker. If the
  shapes don't overlap the result can be **Empty** — an Empty combine **blocks Save** (so it
  can't silently vanish from the saved asset); fix the overlap or **Ungroup** it first.
- **Group shapes** — to move several shapes together as one unit, tap **Select**
  (or shift/⌘-click rows) to pick **two or more** shapes in the **Shapes** list, then
  hit **Group**. They appear in the list under a **Group 1** row with the members
  indented beneath it (double-click the name to rename it; the ▸ chevron collapses
  or expands it). Click the group row to select the whole group — a **Move / Rotate**
  gizmo drives all of its shapes together. Each group row also has **Duplicate** (deep-copies
  the group and its shapes), **Mirror** (mirrors it across the centre — handy for a matching
  pair) and **Ungroup**. **Ungroup** releases the shapes exactly where they are on screen (they
  don't jump), and it's undoable, so **⌘Z** brings the group back. A **Group** ("Group N") is
  a different thing from a **Combine** (⛓) — a Group just moves shapes together and keeps them
  separate; a Combine fuses them with a boolean. A shape can be in one of each.
- **Components (fittings)** — the **Components** panel is a library of ready-made hardware:
  **Legs** (Tapered / Round / Square / Hairpin / Angled), **Handles** (Bar pull / Arc pull /
  Round knob / Recessed pull), **Feet** (Dome foot / Puck foot / Castor) and a **Butt hinge**.
  Tap one to **arm** it — a panel opens with 1–3 sliders (height, width, length…) and a hint.
  Now **click a surface in the preview** to drop the fitting there: it snaps to the face and
  orients itself automatically — a leg dropped on a tabletop's **underside** (or the floor)
  hangs straight down and stands plumb; a bar pull clicked on an **upright** drawer/door front
  sits flush with its bar horizontal. Tap the armed component again, or press **Esc**, to cancel.
  A placed fitting lands as its own named **Group**, so you can move, resize, recolour or ungroup
  it like anything else.
- **Repeat to corners** — placed one leg or foot? Select its group and use **Mirror X**,
  **Mirror Z** or **Repeat ×4** (in the group panel) to copy it to the matching corner(s) of the
  piece in one tap — place a single leg, get a four-legged table. It's one undo step.
- **Arrange (align, distribute, mirror, array)** — with shapes selected, an **Arrange**
  section appears. Pick an **axis** (X/Y/Z), then **Align min**, **Align centre** or **Align max**
  to line the selected shapes up on that axis (needs 2+ shapes), or **Distribute** to space 3+
  shapes with equal gaps. **Mirror X** / **Mirror Z** drop a mirrored copy of the selection across
  the piece's centre — one shape or many. **Array** (in the Array drop-down) duplicates the
  selection into a repeated pattern: a **Linear array** (count, gap, axis) makes a row, a **Radial
  array** (count, radius, sweep) makes a ring. Each array lands as its own **Array** group. Every
  arrange action is one undo step.
- **Grid snap** — the **magnet** button (top-right of the preview) turns grid snapping on/off, and
  the step menu beside it (**1 mm / 5 mm / 1 cm / 5 cm**) sets how coarsely a gizmo drag and the
  size/position number fields step. Your choice is remembered on this device.
- **Dimension readout** — while shapes are selected, the preview shows the selection's size
  (**W × D × H** in centimetres) in the bottom-left corner, updating live as you drag.
- **Views** — the **Front / Side / Top** buttons (top-right) snap the camera to a straight-on view
  of each side; **Home** (the house icon) resets to the default angle.
- **Find & rename shapes** — use the **filter box** above the shape list to find a shape by name.
  Double-click a shape's name (or use its pencil button, or the **Name** field in its edit panel)
  to rename it; a blank name goes back to the default "box 1" style label.
- **Undo / redo** — every edit (add, move, resize, recolour, combine, group, align, array, …) is
  undoable: press **⌘Z** (⇧⌘Z to redo), or use the **↶ / ↷** buttons next to
  "Add shape". A slider or gizmo drag counts as a single step.
- **Start from an asset you designed** — if you pick one of your own
  designer-built assets as the base, a **Restore editable parts** button appears:
  tap it to re-open its original shapes and keep editing them, instead of treating
  the saved asset as a fixed model.

Give it a name and category and hit **Save asset** — it's exported to a GLB and
added to your catalog like any upload, ready to place and reuse. When you started
from one of your own models, flip **Update original** before saving to overwrite
that asset in place — every copy you've already placed updates to the new edit.
Because that changes every placed copy and **can't be undone**, Save first asks you
to confirm.

### Save a multi‑piece design as a set

Designed more than one piece in the same canvas — say a table and a bookshelf, each in
its own **Group**? Flip **Save groups as separate assets** in the Save panel before you
hit **Save asset**. You get the whole thing as one catalog asset **plus** each group
saved as its own single‑piece asset (named after the group), so you can place them
individually or together later. The switch only appears when your design has at least one
group.

### Turn a design into a configurable product

Want to offer swappable options — e.g. round **or** square legs — instead of one fixed
piece? Group the parts that make up each option (for example, put the four legs in their
own group, then **Duplicate** that group and edit the copy into square legs), then use the
**Make configurable** panel:

1. **Name a Slot** on each group you want to offer as an option (e.g. type `Legs`).
   Groups you give the **same** slot name become **alternatives** of that slot — the first
   one is the default. Leave a group's slot blank to keep it as fixed base geometry;
   loose (ungrouped) shapes are always part of the base.
2. Give each option a short **label** and a **price** (defaults to 0 — edit it if you like).
3. Hit **Save as configurable product**.

It opens straight into **Configure a product**, where you (or anyone) can pick an option
per slot, watch the piece update live, and **Save to catalog** / **Add to room** the exact
configuration you want — just like the built‑in configurable products. Your saved product
also shows up as its own tab in **Configure a product** for next time.


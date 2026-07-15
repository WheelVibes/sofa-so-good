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
- **Undo / redo** — every edit (add, move, resize, recolour, combine, …) is
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


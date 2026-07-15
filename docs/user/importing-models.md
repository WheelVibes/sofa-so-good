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
- **Texture a shape** — each shape also has a **Texture** picker: choose **None — solid
  colour** (the default), tap a curated **Quick finishes** swatch (Oak, Walnut, Teak, Ash,
  Ebony, Marble), or pick any catalog / downloaded CC0 material from the dropdown — the
  same finishes you can apply to placed furniture. The texture defines the surface
  (its own roughness/metalness; those two sliders hide while one is set), while glow and
  opacity still apply on top; tap the active swatch (or pick None) to go back to the solid
  colour. Textures are baked into the saved asset, and a **Combined** shape keeps the first
  shape's texture.
- **Drag it in the preview** — selecting a shape shows a 3D gizmo on it, with a
  **Move / Rotate / Scale** switch in the preview's corner (or press **G**, **R**, **S**).
  Drag the arrows/rings/handles to place the shape; when you let go, the numbers in the
  edit panel update (snapped to 5 mm and 1°), so you can still fine-tune by typing.
  A **Combined** shape can be moved and rotated but not scaled — its geometry is baked,
  so the Scale option is hidden for it.
- **Start from an uploaded model** — pick one of your uploaded GLBs as the base and
  resize it to make a custom variant (optionally kit‑bashing extra shapes on top).
- **Combine (boolean)** — with a shape selected and at least one other shape in the
  list, pick the second shape in the **with…** dropdown, then **Union** (merge both
  into one solid), **Subtract** (carve the picked shape out of the selected one — a
  notch, a hole) or **Intersect** (keep only the overlap). The result replaces both
  shapes as a single **Combined** shape that keeps the selected shape's colour, texture and
  finish; you can keep moving/rotating it, recombining it, or carving it again. It
  works on shapes only (not the source model). Changed your mind? **Undo** it
  (see below). If two shapes can't be combined (for example intersecting shapes
  that don't overlap), you'll see "Couldn't combine these shapes".
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


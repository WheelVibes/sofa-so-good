# Importing models

Bring your own 3D furniture into the flat with the **Upload model** dialog. Every
import runs entirely **in your browser** — nothing is uploaded to a server.


## Supported formats

- Native: **`.glb`** / **`.gltf`**
- Converted to GLB in your browser on import: **`.obj`**, **`.fbx`**, **`.stl`**,
  **`.ply`**, **`.dae`**, **`.3mf`**, **`.usdz`**

> **Multi‑file formats** (e.g. an `.obj` with its `.mtl` and texture images) need
> their sibling files included in the same drop, or the materials won't resolve.

## What happens on import

1. Non‑GLB models are **converted to GLB** in the browser.
2. Every model runs through an **optimize pass** — weld / dedup / prune, Draco
   geometry compression, and WebP textures — so it loads fast in the scene.
3. There's an opt‑in **Maximum compression (KTX2)** toggle for GPU‑compressed
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
- **Start from an uploaded model** — pick one of your uploaded GLBs as the base and
  resize it to make a custom variant (optionally kit‑bashing extra shapes on top).

Give it a name and category and hit **Save asset** — it's exported to a GLB and
added to your catalog like any upload, ready to place and reuse. When you started
from one of your own models, flip **Update original** before saving to overwrite
that asset in place — every copy you've already placed updates to the new edit.


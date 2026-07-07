# Importing textures

Use the **Upload material** dialog to bring in your own PBR material and apply it
to furniture as a finish. Like model import, this runs **in your browser** — no
upload.


## Supported maps

- Formats: **PNG**, **JPG**, **WebP**, **BMP**, **TGA**, **TIFF**, **EXR**, **HDR**,
  **KTX2**, **DDS**
- Limits: up to **4096 × 4096**, up to **16 MB** per file
- Exotic formats (TGA / TIFF / EXR / HDR / KTX2 / DDS) are **decoded and re‑encoded
  to WebP** in the browser.

## Maps

- **Albedo / base colour** — required.
- **Normal**, **Roughness**, **Ambient occlusion** — optional, improve realism.

## Importing & using

1. Open the **Upload material** dialog.
2. Add the albedo map (and any of normal / roughness / AO you have).
3. Import — the material is processed and added to the catalog of finishes.
4. Select a piece of furniture and choose your material from its **finish**
   dropdown (it appears alongside the built‑in and CC0 DLC options).

Uploaded **floor / wall** materials also appear in the room finish picker, where
they behave like any other finish: pick a **custom colour** to *repaint* your
texture with it (the pattern is kept — see
[Recolour any finish](/finishes-and-materials#recolour-any-finish-colour-and-texture-are-independent)),
and use **Compose your own…** to tune the tile scale and gloss. A greyscale
pattern upload works as a reusable template you can tint in any colourway.

> **Worked example — a custom wood table top**
> 1. Import a **TGA albedo** + a **normal** map.
> 2. Select a table, open its inspector.
> 3. Pick the imported material from the surface **finish** dropdown.

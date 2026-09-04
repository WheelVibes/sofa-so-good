import type { LayoutPreset } from './types'

/**
 * **Blue moved from every wall to ONE feature wall (v0.31.8.2).**
 *
 * `docs/research/2026-09-02-scheme-theme-grounding.md` verified every element of
 * this palette against published coastal references and then flagged the
 * emphasis: the sources warn that "using only bright white and navy can look
 * crisp in a photo, but in real homes it may feel cold or too nautical", and
 * recommend "warm whites, sand tones, light wood… a stronger foundation than
 * obvious nautical themes". This preset committed sky blue to the WALLS, which
 * is the more cliché-prone reading the sources name by name.
 *
 * So the foundation is now Oat (`#d8cdb8`) — the SG-cited "oat, warm sand"
 * neutral — and blue survives as the single accent the references prescribe, on
 * a fluted feature wall. Fluted panelling is not a decorative liberty here: it
 * is the most-specified feature-wall treatment in Singapore homes, and the
 * coastal reading of it is documented as "painted white or soft grey" for a
 * "breezy, coastal-Scandi mood".
 *
 * **What this treatment is NOT.** Coastal shiplap is HORIZONTAL boarding, and
 * the `feature-wall` primitive only profiles vertical flutes/slats. This is a
 * vertical fluted panel painted in the theme blue — a real SG treatment, but not
 * shiplap. Stated rather than glossed, because the two read differently and a
 * future horizontal profile would be the closer match.
 */
export const coastal: LayoutPreset = {
  id: 'coastal',
  name: 'Coastal',
  description: 'Pale ash, oat walls, one sky-blue fluted feature wall, navy + white textiles.',
  dryFloor: 'floor-wood-ash',
  wall: 'wall-paint-oat',
  style: {
    'sofa-3seat': {
      color: '#eceae2',
      material: 'fabric',
      pattern: 'striped',
      pillowColor: '#3b4a63',
    },
    armchair: { color: '#3b4a63', material: 'fabric', style: 'standard' },
    'dining-chair': { style: 'wood', seatColor: '#cdb696', finish: 'painted' },
    rug: { color: '#dfe2e6', borderColor: '#3b4a63', pattern: 'striped' },
    'coffee-table': { color: '#cdb696', finish: 'painted' },
    'side-table': { topColor: '#eceae2', finish: 'painted' },
    'dining-table-4': { topColor: '#cdb696', legColor: '#eceae2' },
    'bed-queen': {
      frameColor: '#cdb696',
      beddingColor: '#eef1f4',
      throwColor: '#3b4a63',
      headboardStyle: 'upholstered',
      beddingPattern: 'striped',
    },
    'bed-single': { frameColor: '#cdb696', beddingColor: '#eef1f4', throwColor: '#3b4a63' },
    'bed-double': { frameColor: '#cdb696', beddingColor: '#eef1f4', throwColor: '#3b4a63' },
    nightstand: { color: '#eceae2', finish: 'painted' },
    dresser: { color: '#eceae2', finish: 'painted' },
    bookshelf: { color: '#eceae2', finish: 'painted' },
    desk: { color: '#eceae2', finish: 'painted' },
    'tv-console': { color: '#eceae2', finish: 'painted' },
    'wardrobe-3door': { color: '#eef1f4' },
    curtains: { color: '#dfe2e6' },
  },
  extraItems: [
    {
      id: 'coastal-feature',
      defId: 'feature-wall',
      // The living/dining wall Japandi and Modern Mono already use, against the
      // same default layout (none of these presets overrides `livingDining`),
      // so the position is proven rather than newly guessed.
      position: [12.53, 2.45],
      rotation: -Math.PI / 2,
      // Sky blue is `wall-paint-blue`'s own swatch — the colour that used to be
      // on every wall, now carried by this one panel.
      // TINTED TIMBER, not 'painted', and the reason is measured rather than
      // stylistic. `FeatureWall`'s flutes are real half-round cylinders, but at
      // 3.0 m wide the batten radius is only ~25 mm, and `painted` resolves to
      // `getPaintedMaterial` — a solid colour with NO map or normal map. Seen
      // near face-on in this app's soft diffuse interior light, that leaves the
      // ribs with no shading cue at all: screenshotted, the panel rendered as a
      // FLAT slab, and raising `sheen` to 0.4 (which does reach the material,
      // lowering roughness from 0.72) changed nothing perceptible.
      //
      // Both shipped feature walls read as fluted because their finishes carry
      // a TEXTURE — Japandi 'wood', Modern Mono 'gloss'. I initially mistook
      // Japandi's wood grain for its flute geometry; the stripes are the grain.
      //
      // `wood` MULTIPLIES this colour over the grain (unlike a `mat:<id>`
      // finish, which would ignore it — see FURNITURE-WOOD-SCALE), so a pale
      // sky blue yields tinted boarding with legible grain. That is also the
      // documented treatment rather than a workaround: coastal panelling is
      // timber boarding "painted white or soft grey", i.e. paint over wood with
      // the grain still showing.
      props: { width: 3.0, height: 2.55, style: 'fluted', color: '#a9c1d6', finish: 'wood' },
    },
  ],
}

# Scheme theme grounding — are the G8 themes what these styles actually look like?

**Requirement (user, 2026-09-02).** The alternative schemes G8 generates must be
grounded in actual research into what these styles look like in real life, not
in invented palettes.

**What I did, stated precisely.** I verified each theme's encoded finishes
(`dryFloor`, `wall`) and its description against published interior-design
references — style guides, palette references and materials guides, including
Singapore-specific HDB/condo sources. I did **not** visually inspect photographs
myself; the grounding is in what those references state that these styles use.
That distinction matters, so it is recorded here rather than glossed.

**Verdict: the four themes the scheme comparison actually surfaces are
accurate**, and two of them encode a detail that only someone who knows the
style would get right. Nothing needed correcting.

## Verified

### Modern Contemporary (`moveIn`) — the default
Encodes `floor-wood-oak` + `wall-paint-white`, described as "White walls, warm
oak, one deep navy accent — the everyday SG default."

Confirmed on all three points. SG sources describe walls "kept a clean white",
"light oak and ash tones" as "perennial favourites" for HDB flats, and the
specific discipline of "limiting yourself to one or two accent tones like deep
navy". The claim that this is the *everyday SG default* is also borne out —
Scandinavian-derived light-wood-and-white is described as "the perennial
favourite" for HDB living rooms. The preset's "ONE deep navy accent" matches the
restraint the references prescribe, rather than the more common mistake of
scattering an accent colour.

### Scandi Calm — `floor-wood-ash` + `wall-paint-soft-white`
"Pale ash woods, soft-white walls, light textiles."

Confirmed. References give light woods specifically as "white oak, ash, or pine"
and "birch, ash, beech, oak", walls "covered in white… and the floors pale", and
textiles in "linen, wool, cotton". Ash is a named-correct choice, not a generic
"light wood", and the low-sheen/matte finish the references call for is
consistent with the app's procedural wood.

### Japandi — `floor-wood-oak` + `wall-paint-warm`
"Oak + warm white, low-contrast natural calm with black accents."

Confirmed, including the subtle part. References describe a base of "warm white,
ivory, bone, and soft beige" with warm oak, and are explicit that "black is used
**sparingly** for contrast" — which is exactly what "black *accents*" encodes.
The preset's "low-contrast" framing matches the references' emphasis on depth
"through light, shadow, and texture" rather than colour contrast.

### Warm Industrial — `floor-tile-charcoal` + `wall-paint-greige`
"Charcoal tile, greige walls, leather and dark timber."

Confirmed, and this is the one that reads as genuinely well-informed. The
industrial references' central warning is that the style goes cold, and their
prescribed fix is precisely this: "Replace cool concrete gray walls with a
**greige** or warm taupe… The palette barely changes visually, but the room stops
feeling like a boiler room." They also name "dark-stained oak, reclaimed timber,
and walnut" as the warm counterpoint and "honeyed tan from leather". A greige
wall against charcoal floor with leather and dark timber is the documented warm
industrial recipe, not a guess.

## Not yet verified

`LAYOUT_PRESETS` ships **17** themes. The scheme comparison currently surfaces
the first three plus any the brief names, so the four above are what a user
actually sees today. The remaining thirteen — Coastal, Warm Minimalist / Muji,
Modern Luxe, Modern Mono, Peranakan Accent, Cozy Tropical, Boutique Suite,
Broken Plan, Entertainer, Family Nursery, Open Lounge, Social Lounge, WFH Studio
— are **unaudited**. Two spot-checks suggest they are likely sound (Coastal:
`floor-wood-ash` + `wall-paint-blue` + "navy + white nautical textiles";
Warm Minimalist / Muji: `floor-wood-ash` + `wall-paint-soft-white` + "oat &
cream, low furniture, no harsh contrast" — both consistent with their styles),
but *likely* is not *verified*, and they should be audited before the comparison
widens beyond three schemes. Tracked in `TODO.md`.

## Consequence for G8

Scheme generation rests on a sound style vocabulary — so the weakness in G8 is
**not** the themes. It is what v0.31.5.262 already recorded: no preset defines
`kits`, so themes differ in finish and styling but place identical furniture, and
layout variety comes only from the arranger's reroll seed. The highest-value next
step remains giving a few themes real kit differences — and this audit says what
those kits should contain, e.g. rattan/bamboo and handmade ceramics for Japandi,
wool and linen for Scandi, leather and reclaimed timber for Warm Industrial.

## Sources

- [Japandi Color Palette — shopjapandi.com](https://www.shopjapandi.com/blogs/design/japandi-color-palette)
- [Japandi Style: Complete Home Decor & Interior Design Guide — Trove](https://troveobjectgallery.com/pages/complete-guide-to-japandi-home-decor)
- [Japandi Color Palette: 2026 Guide to Earthy Neutrals — homeoration.com](https://homeoration.com/japandi-color-palette/)
- [Scandinavian Wood Flooring — Floor & Decor](https://www.flooranddecor.com/scandinavian-inspired-wood)
- [The Complete Guide to Scandinavian Home Decor — Trove Gallery](https://troveobjectgallery.com/blogs/curators-journal/scandinavian-home-decor-guide)
- [7 Types of Scandinavian Flooring — decosurfaces.com](https://www.decosurfaces.com/en/blog/article/138-7_ideas-for-scandinavian-floor.html)
- [Industrial Interior Design (Without the "Cold Warehouse" Problem) — ArchitectureCourses.org](https://www.architecturecourses.org/home-and-garden/industrial-interior-design)
- [Industrial Color Palette Ideas For Home Interiors — awedeco.com](https://awedeco.com/industrial-color-palette/)
- [Industrial Interior Design 101 — domkapa.com](https://domkapa.com/en/blog/inspiration/industrial-interior-design-101-essential-tips-to-embrace-this-raw-aesthetic/)
- [Singapore HDB Living Room Design Ideas 2025 — Space Factor](https://www.spacefactor.com.sg/top-hdb-living-room-design-ideas-in-singapore/)
- [Scandinavian Interior Design Singapore: HDB and Condo Guide — RS Carpentry](https://rscarpentry.com.sg/interior-design-trends/scandinavian-interior-design-singapore-hdb-condo-guide/)
- [7 Best Modern HDB Interior Design Styles in Singapore — Swiss Interior](https://www.swissinterior.com.sg/blog/7-best-modern-interior-design-hdb-styles-in-singapore)

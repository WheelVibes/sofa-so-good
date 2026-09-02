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

**Verdict so far (6 of 17 audited).** Five themes verify accurately — several
encode details only someone who knows the style would get right. **One needed
correcting** (Modern Luxe; see round 2). One has a named fidelity gap that is a
missing material rather than a wrong choice (Peranakan Accent).

## Round 1 — the four the comparison surfaces

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

## Round 2 (2026-09-02) — two more verified, and ONE correction found

### Peranakan Accent — `floor-wood-ebony` + `wall-paint-warm` — VERIFIED (palette)
"Cream & dark tropical wood, emerald/coral/cobalt jewel accents, patterned rug."

The palette is exactly right, including the contrast RULE. References describe
"vibrant jewel-tone colours: **emerald, cobalt, coral**, gold, and magenta,
**always contrasted against white or cream**" — the preset names emerald, coral
and cobalt against cream. Dark carved tropical hardwood is also correct
(references name carved **teak and rosewood**; the preset's ebony is a plausible
dark tropical stand-in from the app's palette).

**One fidelity gap, and it is the iconic element.** References call the geometric
**encaustic floor tiles** "among the most recognisable elements of this design
tradition" — the Peranakans tiled floors and facades with them for their floral
motifs and colour. The preset carries the motif on a *patterned rug* over a dark
wood floor instead, because the material catalog has no Peranakan encaustic tile.
That is a defensible substitution, not an error, but adding a Peranakan encaustic
tile material would be the single highest-fidelity improvement available to any
theme in the set. Recorded in `TODO.md`.

### Modern Luxe — `floor-wood-walnut` + `wall-paint-warm` — CORRECTED
Was: "Ivory, taupe & chocolate — brass accents, **lacquered** finishes, quiet
luxury." Now: "… **satin** finishes …".

The colours and materials verify precisely: references give "warm ivory", "soft
taupe" and "chocolate" as a deeper accent, "solid oak and **walnut** for
furniture", and brass as the metal. But they are equally explicit that the look is
"**matte and semi-matte** finishes" and that "**unlacquered** brass is the quiet
luxury metal because it develops a patina over time that cannot be faked".
"Lacquered" describes high-gloss glam — close to the opposite style.

Crucially, the **implementation was already right**: the preset's own style props
use `sheen: 0.3`, i.e. semi-matte. So only the user-facing description was wrong —
and since v0.31.5.263 that description renders in the scheme-comparison modal, so
a user would have read "lacquered" while looking at satin surfaces. Fixed as a
text correction, with the reasoning inline at the preset so it is not "tidied"
back.

This is worth noting as a pattern: the divergence was not in what the app DOES
but in what it SAYS about what it does — which is exactly the class of error a
grounding audit catches and a screenshot does not.

### Still unaudited (11)
Coastal, Warm Minimalist / Muji, Modern Mono, Tropical Biophilic, Boutique Suite,
Broken Plan, Entertainer, Family Nursery, Open Lounge, Social Lounge, WFH Studio.
Tropical Biophilic ("Teak floors, sage walls, lush greenery and terracotta
accents") and Modern Mono ("Grey porcelain, charcoal walls, glossy monochrome")
both read as internally coherent, but coherent is not verified — and Modern Luxe
above was internally coherent too, while contradicting its own style's
references. Audit before widening the comparison past three schemes.

## Additional sources (round 2)

- [Peranakan-Inspired Interior Design in Singapore — Goodrich Global](https://www.goodrichglobal.com/singapore/article/peranakan-inspired-interior-design/)
- [Peranakan tiles: A harmony of colour, motif and texture — Garland Magazine](https://garlandmag.com/article/peranakan-tiles/)
- [Baba Nyonya Design Inspiration & Ideas — Signature Malaysia](https://signature.my/blog/2026/03/28/baba-nyonya-design-inspiration-ideas-for-your-home/)
- [2025 Interior Color Trends: Quiet Luxury — zeysey.com](https://www.zeysey.com/en/quiet-luxury-colors/blog/detail/2025-interior-color-trends-quiet-luxury-earthy-tones-soft-minimal-palettes)
- [Quiet Luxury Color Palettes: Neutrals & Greige — Suave Vera](https://suavevera.com/quiet-luxury-color-palettes/)
- [Quiet Luxury Interior Design: How to Get the Look — inspireddesigntalk.com](https://inspireddesigntalk.com/quiet-luxury-interior-design/)

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


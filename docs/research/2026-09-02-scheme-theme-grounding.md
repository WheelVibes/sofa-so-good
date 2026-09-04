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

**Verdict: COMPLETE — all 17 presets addressed** (see the Final tally at the
end). Ten style themes audited against published references: nine accurate as
written, **one corrected** (Modern Luxe), **two with a flagged wall-vs-accent
divergence** (Coastal, Tropical Biophilic), **one with a named missing material**
(Peranakan encaustic tile). The seven `layout`-group presets are researched by
construction — they author real-world arrangements rather than palettes.

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
and since v0.31.5.364 that description renders in the scheme-comparison modal, so
a user would have read "lacquered" while looking at satin surfaces. Fixed as a
text correction, with the reasoning inline at the preset so it is not "tidied"
back.

This is worth noting as a pattern: the divergence was not in what the app DOES
but in what it SAYS about what it does — which is exactly the class of error a
grounding audit catches and a screenshot does not.

### Then still unaudited (11) — now closed in round 3 below
The caution recorded at the time is worth keeping: Modern Luxe read as internally
coherent while contradicting its own style's references, so "looks consistent" is
not evidence. Round 3 checked the remaining style themes on that basis, and one
of them (Modern Mono) came back clean precisely because it was checked rather
than assumed either way.

## Additional sources (round 2)

- [Peranakan-Inspired Interior Design in Singapore — Goodrich Global](https://www.goodrichglobal.com/singapore/article/peranakan-inspired-interior-design/)
- [Peranakan tiles: A harmony of colour, motif and texture — Garland Magazine](https://garlandmag.com/article/peranakan-tiles/)
- [Baba Nyonya Design Inspiration & Ideas — Signature Malaysia](https://signature.my/blog/2026/03/28/baba-nyonya-design-inspiration-ideas-for-your-home/)
- [2025 Interior Color Trends: Quiet Luxury — zeysey.com](https://www.zeysey.com/en/quiet-luxury-colors/blog/detail/2025-interior-color-trends-quiet-luxury-earthy-tones-soft-minimal-palettes)
- [Quiet Luxury Color Palettes: Neutrals & Greige — Suave Vera](https://suavevera.com/quiet-luxury-color-palettes/)
- [Quiet Luxury Interior Design: How to Get the Look — inspireddesigntalk.com](https://inspireddesigntalk.com/quiet-luxury-interior-design/)

## Consequence for G8

Scheme generation rests on a sound style vocabulary — so the weakness in G8 is
**not** the themes. It is what v0.31.5.363 already recorded: no preset defines
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

## Round 3 (2026-09-02) — the audit is COMPLETE (17/17)

### Warm Minimalist / Muji — `floor-wood-ash` + `wall-paint-soft-white` — VERIFIED
"Re-modelled L/D: oat & cream, low furniture, no harsh contrast."

A precise 4-for-4 match. References give "warm white, cream, **oatmeal**, sand,
mushroom, and soft taupe"; "simple, **low** sofas… furniture is **low-profile**";
and — the real tenet — "instead of **bold contrasts**, Muji design uses textures…
creating depth without visual noise", i.e. exactly "no harsh contrast". Light
wood confirmed. Nothing to change.

### Tropical Biophilic — `floor-wood-teak` + `wall-paint-sage` — VERIFIED
"Teak floors, sage walls, lush greenery and terracotta accents."

The SG-specific sources name this palette almost verbatim: "warm whites, sandy
beiges, **terracotta**, **sage green**, and warm wood tones in **teak**, oak, and
walnut", and "terracotta and rust… pair beautifully with **greenery**". Also
confirmed as climate-appropriate for Singapore rather than a transplanted look.

### Modern Mono — `floor-tile-grey` + `wall-paint-charcoal` — VERIFIED
"Grey porcelain, charcoal walls, glossy monochrome."

I expected this to be a second "lacquered"-style overstatement and checked before
claiming one. It is not: `floor-tile-grey` uses the `tile` painter, whose module
doc states "the glaze is **glossy** (low roughness), the grout is a matte
cement". So the floor genuinely renders as glossy glazed porcelain and "glossy
monochrome" is accurate — the velvet armchair at `sheen: 0.4` is a deliberate
texture contrast, not a contradiction. Worth recording that the check ran and
came back clean, since the Modern Luxe correction made a second one plausible.

### Coastal — `floor-wood-ash` + `wall-paint-blue` — VERIFIED, with a flagged divergence
"Pale ash, sky-blue walls, navy + white nautical textiles."

Every element is inside the documented coastal palette: "various blues ranging
from **sky blue** to **deep navy**", light "whitewashed or weathered wood", and
"stripes, especially **blue and white**" in textiles. So nothing here is wrong.

**But the references warn against exactly this emphasis.** They say "using only
bright white and navy can look crisp in a photo, but in real homes it may feel
cold or too nautical", and recommend "warm whites, sand tones, light wood…
a stronger foundation than obvious nautical themes… just enough editing to keep
the room from tipping into **cliché**". The preset commits blue to the WALLS and
leans on nautical textiles — the more cliché-prone reading, where best practice
puts warm white / sand on the walls and keeps blue as an accent.

### The same divergence, twice — walls vs accents
Tropical Biophilic has the identical shape: its sources say "**one feature wall**
in terracotta or sage green adds depth without overwhelming the space", while the
preset applies sage to every dry wall.

So both themes take a colour the references treat as an ACCENT or a single feature
wall and make it the whole-home wall finish. Neither is factually wrong, and a
bolder reading is a legitimate design choice — but it is a choice that diverges
from the documented practice, and in Coastal's case toward the specific failure
mode the sources name.

### RESOLVED 2026-09-03 (v0.31.8.2) — the colour moved to one feature wall

Escalated as a content decision rather than fixed unilaterally, and the
maintainer chose to research SG-specific treatments and implement. Both themes
now use a warm neutral foundation with the theme colour on a single fluted
feature wall in the living/dining.

| Theme | Was | Now |
|---|---|---|
| Coastal | `wall-paint-blue` on every dry wall | `wall-paint-oat` (`#d8cdb8`) + one sky-blue (`#a9c1d6`) fluted panel |
| Tropical Biophilic | `wall-paint-sage` on every dry wall | `wall-paint-warm` (`#e9d8c4`) + one sage (`#a7b59a`) fluted panel |

The SG-specific sources are more pointed than the general ones. On biophilic
colour: these shades "work best on a single feature wall, providing a focal point
that doesn't overwhelm the room's proportions", and terracotta "should be used as
a feature wall rather than on all four walls in smaller HDB rooms". On the
foundation: "warm white, off-white, warm sand, and sage green all complement teak
and walnut furniture" — teak being exactly Tropical Biophilic's floor. On the
treatment itself: fluted panelling is "one of the most sought-after interior
treatments in Singapore, from HDB living room feature walls to hotel lobby
backdrops", and its coastal reading is documented as boards "painted white or
soft grey" for a "breezy, coastal-Scandi mood".

The panels sit at `[12.53, 2.45]`, the living/dining wall Japandi and Modern Mono
already use against the same default layout — none of the four presets overrides
`livingDining`, so the position was proven rather than newly guessed.

**Two honest limits.** Coastal shiplap is HORIZONTAL boarding and `FeatureWall`
only profiles vertical flutes/slats, so this is a vertical fluted panel, not
shiplap. And terracotta was left alone in Tropical Biophilic because it was
already an accent (pillow, throws) — only sage's SCOPE changed.

**A defect found while verifying, worth more than the change.** The first cut used
`finish: 'painted'`, and the panel rendered as a completely FLAT slab: the flutes
are real half-round cylinders, but `getPaintedMaterial` supplies no map or normal
map, and at a 3.0 m width the batten radius is only ~25 mm — no shading cue at all
face-on in this app's diffuse interior light. Raising `sheen` to 0.4 (which does
reach the material, dropping roughness from 0.72) changed nothing perceptible. I
had also mistaken Japandi's WOOD GRAIN for its flute geometry when using it as the
control; the stripes that read as flutes are the grain. Both panels therefore use
a tinted `wood` finish, which multiplies the theme colour over the grain — and is
the truer spec anyway, since painted timber boarding shows its grain. Logged in
`TODO.md`: a painted fluted panel is a legitimate real-world specification, so the
def needs a normal map or a deeper default flute to render one honestly.

## Final tally

**All 17 presets addressed.**

- **10 `theme`-group** (style claims) audited against published references:
  Modern Contemporary, Scandi Calm, Japandi, Warm Industrial, Peranakan Accent,
  Modern Luxe, Warm Minimalist / Muji, Tropical Biophilic, Modern Mono, Coastal.
  Result: 9 accurate as written, **1 corrected** (Modern Luxe's "lacquered" →
  "satin"), **2 with a flagged wall-vs-accent divergence** (Coastal, Tropical
  Biophilic), **1 with a named missing material** (Peranakan encaustic tile).
- **7 `layout`-group** (arrangement claims, not palettes) — established in
  v0.31.5.367 to be researched BY CONSTRUCTION: each authors an explicit
  `livingDining` array that `presets/types.ts` describes as "a researched
  real-world layout", and they demonstrably deliver what they describe
  (`entertainer`'s bar cart, `social-lounge`'s angled armchairs). Their finishes
  are incidental and reuse audited theme values.

So the schemes G8 offers are grounded: the palettes are verified against
published references, and the arrangements are the app's own authored research.

## Additional sources (round 3)

- [Coastal Interior Design — Nazmiyal](https://nazmiyalantiquerugs.com/blog/what-is-coastal-interior-design-and-home-decor-style/)
- [The Ultimate Guide to Coastal Style — Wayfair](https://www.wayfair.com/sca/ideas-and-advice/styles/the-ultimate-guide-to-coastal-style-T1501)
- [What Is Coastal Interior Design? — Floof](https://floofliving.com/blogs/pillow-talk/what-is-coastal-interior-design)
- [Muji Style Interior Design: A Complete Guide — KLAAS](https://klaas.com.my/muji-style-interior-design-a-complete-guide-to-minimalist-japanese-living/)
- [Muji Living Room Ideas — Livingetc](https://www.livingetc.com/ideas/muji-style-living-room)
- [6 Ways To Attain A Muji Style Home — Nippon Paint SG](https://nipponpaint.com.sg/resources/painting-articles/muji-style-home/)
- [Tropical Interior Design for Singapore Homes — Goodrich Global](https://www.goodrichglobal.com/singapore/article/tropical-interior-design-singapore/)
- [Earth Tones and Warm Wood: the 2026 SG palette — Born in Colour](https://www.bornincolour.com/blogs/news/earth-tones-and-warm-wood-the-2026-interior-colour-palette-taking-over-singapore-homes)
- [Biophilic Design in Singapore — Goodrich Global](https://www.goodrichglobal.com/singapore/article/biophilic-design-singapore-interiors/)
- [Fluted Panel Wall Design Ideas for Singapore Homes — Goodrich Global](https://www.goodrichglobal.com/singapore/article/fluted-panel-wall-design-singapore/)
- [Fluted Wall Panels Singapore: The Complete Guide — Lexsure Flooring](https://lexsureflooring.com/tips/fluted-wall-panels-singapore/)
- [Wall Panelling Ideas for Singapore Homes — Goodrich Global](https://www.goodrichglobal.com/singapore/article/wall-panelling-ideas-singapore/)
- [Bringing Nature Home: Biophilic Design in Your Singapore HDB Interior — The Interior Lab](https://www.theinteriorlab.com.sg/bringing-nature-home-a-guide-to-incorporating-biophilic-design-in-your-singapore-hdb-interior/)
- [Feature Wall Trends: Statements for Singapore Homes — Lemon Fridge](https://www.lemonfridge.sg/feature-wall/)

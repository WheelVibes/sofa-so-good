"""
Category + placement-semantics mapping for interior-design metadata.

IKEA's breadcrumb (e.g. "Beds & mattresses > Bed frames > ...") is a shopping
taxonomy. An interior-design tool needs two derived things:

  * a functional CATEGORY  — beds / seating / tables / storage / kitchen /
    bathroom / appliances / lighting / decor / textiles / outdoor /
    electronics / kids / laundry / others — used for auto-arrange roles,
    budgeting and room assignment.
  * PLACEMENT SEMANTICS — how the item occupies space: does it sit on the floor,
    mount on a wall, hang from the ceiling; does it go back-to-wall; does it need
    clearance in front (drawers/doors/appliances). This is what separates "a mesh"
    from "a wardrobe that flushes to a wall and needs drawer clearance".

Both are derived from the breadcrumb/type text. The mapping is intentionally
explicit and conservative; unmatched products fall back to "others" + floor
placement and are flagged via `category_confidence: "low"` so they can be
reviewed rather than silently mis-placed.
"""

import re

# Ordered (keyword-regex -> category) rules; first match wins. Keywords are
# matched against the joined, lowercased breadcrumb + type name.
# Order matters: more specific / disambiguating rules come first. Lighting
# precedes tables so "table lamp" is lighting; bathroom and appliances precede
# storage so "wash-basin cabinet"/"oven" aren't swallowed by the "cabinet" rule.
_CATEGORY_RULES = [
    (r"\b(lamp|lighting|chandelier|sconce|pendant|luminaire|spotlight|"
     r"led (strip|light)|ceiling light|wall light)\b", "lighting"),
    (r"\b(hob|oven|fridge|freezer|dishwasher|microwave|cooker|extractor|"
     r"washing machine|tumble dryer)\b", "appliances"),
    # TV furniture (bench/unit/stand) is storage — match it before the
    # electronics "tv" token so a "TV bench" isn't mis-read as a television.
    (r"\btv (bench|unit|stand)\b", "storage"),
    (r"\b(tvs?|televisions?|monitors?|speakers?|soundbars?|sound systems?|"
     r"chargers?|smart home|remote controls?|headphones?|earphones?|routers?|"
     r"air quality sensors?)\b", "electronics"),
    (r"\b(baby|children|kids|junior|cots?|cribs?|high chairs?|changing|"
     r"nursery|toys?)\b", "kids"),
    (r"\b(laundry|drying racks?|clothes airers?|ironing|laundry baskets?|"
     r"laundry bags?)\b", "laundry"),
    (r"\b(toilet|wash-?basin|bathroom|shower|bathtub|bath\b|tap|faucet)\b", "bathroom"),
    (r"\b(bed frame|mattress|slatted bed base|headboard|divan|bunk)\b", "beds"),
    (r"\b(sofa|armchair|chair|stool|bench|pouffe|recliner|seat|sofa-bed)\b", "seating"),
    (r"\b(wardrobe|chest of drawers|dresser|bookcase|shelf|shelving|cabinet|"
     r"sideboard|tv (bench|unit)|storage|drawer)\b", "storage"),
    (r"\b(table|desk|nightstand|bedside|console)\b", "tables"),
    (r"\b(kitchen|worktop|sink unit|base cabinet|wall cabinet)\b", "kitchen"),
    (r"\b(rug|carpet|curtain|cushion|throw|textile|bed linen|duvet|"
     r"blanket|towel)\b", "textiles"),
    (r"\b(plant|vase|mirror|frame|decor|ornament|candle|clock|art)\b", "decor"),
    (r"\b(outdoor|garden|patio|balcony)\b", "outdoor"),
]

# Placement semantics per category (defaults; refined below by keyword).
# placement: floor | wall | ceiling | surface (sits on another surface)
# back_to_wall: prefers flush against a wall
# front_clearance_m: clear floor needed in front (doors/drawers/appliance access)
_CATEGORY_SEMANTICS = {
    "storage":    {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.75},
    "beds":       {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.0},
    "seating":    {"placement": "floor", "back_to_wall": False, "front_clearance_m": 0.0},
    "tables":     {"placement": "floor", "back_to_wall": False, "front_clearance_m": 0.0},
    "appliances": {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.9},
    "kitchen":    {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.9},
    "bathroom":   {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.6},
    "lighting":   {"placement": "ceiling", "back_to_wall": False, "front_clearance_m": 0.0},
    "textiles":   {"placement": "floor", "back_to_wall": False, "front_clearance_m": 0.0},
    "decor":      {"placement": "surface", "back_to_wall": False, "front_clearance_m": 0.0},
    "outdoor":    {"placement": "floor", "back_to_wall": False, "front_clearance_m": 0.0},
    "electronics":{"placement": "surface", "back_to_wall": False, "front_clearance_m": 0.0},
    "kids":       {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.0},
    "laundry":    {"placement": "floor", "back_to_wall": True,  "front_clearance_m": 0.0},
    "others":     {"placement": "floor", "back_to_wall": False, "front_clearance_m": 0.0},
}


def categorize(category_hierarchy, type_name=None):
    """
    Map an IKEA breadcrumb (+ optional type name) to a functional category.
    Returns (category, confidence) where confidence is 'high' | 'low'.
    """
    text = " ".join((category_hierarchy or []) + ([type_name] if type_name else [])).lower()
    for pattern, category in _CATEGORY_RULES:
        if re.search(pattern, text):
            return category, "high"
    return "others", "low"


def placement_semantics(category, type_name=None, footprint=None):
    """
    Derive placement semantics for a category, refined by type-name keywords and
    footprint where useful. footprint is the GLB footprint dict {w,d,h,...}.
    """
    sem = dict(_CATEGORY_SEMANTICS.get(category, _CATEGORY_SEMANTICS["decor"]))
    t = (type_name or "").lower()

    # Refinements that override the category default.
    if re.search(r"\b(rug|carpet|mat)\b", t):
        sem.update({"placement": "floor", "no_clip": True, "back_to_wall": False,
                    "front_clearance_m": 0.0})
    elif re.search(r"\b(pendant|chandelier|ceiling)\b", t):
        sem["placement"] = "ceiling"
    elif re.search(r"\b(wall|sconce)\b", t) and category in ("lighting", "storage", "decor"):
        sem["placement"] = "wall"
        sem["back_to_wall"] = True
    elif re.search(r"\b(floor lamp|table lamp|desk lamp)\b", t):
        # Lamps that stand or sit, not hang.
        sem["placement"] = "surface" if "table" in t or "desk" in t else "floor"
    elif re.search(r"\b(mirror|picture|frame|art|shelf)\b", t) and category in ("decor", "storage"):
        sem["placement"] = "wall"

    # A "surface" item that is large/heavy is more likely floor-standing.
    if sem.get("placement") == "surface" and footprint:
        if max(footprint.get("w", 0), footprint.get("d", 0)) > 0.8 or footprint.get("h", 0) > 0.8:
            sem["placement"] = "floor"

    # Wall/ceiling items are 'mounted' for collision (don't block walls).
    if sem.get("placement") in ("wall", "ceiling"):
        sem["mounted"] = True

    return sem


def design_classification(category_hierarchy, type_name=None, footprint=None):
    """Convenience: full classification block for the metadata file."""
    category, confidence = categorize(category_hierarchy, type_name)
    sem = placement_semantics(category, type_name, footprint)
    return {
        "category": category,
        "category_confidence": confidence,
        "placement": sem.pop("placement"),
        "semantics": sem,
    }


if __name__ == "__main__":
    import sys, json
    # quick manual check: pass a breadcrumb as args
    bc = sys.argv[1:] or ["Beds & mattresses", "Bed frames", "Single & super single bed frames"]
    print(json.dumps(design_classification(bc, "bed frame, high"), indent=2, ensure_ascii=False))

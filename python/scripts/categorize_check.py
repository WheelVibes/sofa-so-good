"""Lightweight assertion check for categorize.py (no pytest dependency).

Mirrors the real caller (`categorize(category_hierarchy, type_name)`): the
scraper always passes the singular `type_name` alongside the breadcrumb, which
is what the rules match against.
"""
from categorize import categorize

def expect(bc, type_name, want_cat, want_conf="high"):
    cat, conf = categorize(bc, type_name)
    assert cat == want_cat, f"{bc!r}/{type_name!r} -> {cat} (wanted {want_cat})"
    assert conf == want_conf, f"{bc!r}/{type_name!r} conf {conf} (wanted {want_conf})"

# New categories.
expect(["Home electronics", "TVs"], "tv", "electronics")
expect(["Home electronics", "Speakers"], "speaker", "electronics")
expect(["Home electronics", "Monitors"], "monitor", "electronics")
expect(["Baby & children's furniture", "Cots"], "cot", "kids")
expect(["Baby & children's furniture", "High chairs"], "high chair", "kids")
expect(["Laundry & cleaning", "Drying racks"], "drying rack", "laundry")
expect(["Some unknown department"], "mystery gadget", "others", "low")

# Regression: existing mappings unchanged.
expect(["Beds & mattresses", "Bed frames"], "bed frame", "beds")
expect(["Lighting", "Table lamps"], "table lamp", "lighting")
# A TV bench / unit is storage, not electronics (negative lookahead on tv rule).
expect(["Storage", "TV & media furniture"], "tv bench", "storage")
print("categorize_check OK")

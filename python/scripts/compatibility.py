"""
Runtime compatibility resolver for scraped IKEA metadata.

The scraper stores a *category rule* on each product instead of a frozen list of
compatible article numbers (see the `compatibility` block written by
ikea_model_scraper.py). This module resolves that rule against a local catalogue
of scraped products at load time, so the matches are always limited to models you
actually have and never go stale.

A product P is compatible with the active product A when:
  * P's category (its breadcrumb leaf or type) is one of A.compatibility.accepts_categories
  * P's size matches A.compatibility.size (when both declare a size)
"""

import os
import re
import json
import glob


def _norm(text):
    return re.sub(r'\s+', ' ', (text or '')).strip().lower()


def load_catalog(models_dir):
    """
    Load every variant-group metadata.json under models_dir. Each group folder
    holds one model's shared specs plus a `variants` list (one per finish).
    """
    catalog = []
    for path in glob.glob(os.path.join(models_dir, "*", "metadata.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["_path"] = path
            catalog.append(data)
        except (OSError, json.JSONDecodeError):
            continue
    return catalog


def product_categories(product):
    """
    The category labels a product can be matched *against* — its breadcrumb leaf
    plus the broader breadcrumb names and its type name, all normalised. IKEA's
    "Complete with" pill labels (e.g. "Slatted bed bases") are plural category
    names, so we match loosely on those tokens.
    """
    labels = set()
    for crumb in product.get("category_hierarchy", []):
        labels.add(_norm(crumb))
    if product.get("type_name"):
        labels.add(_norm(product["type_name"]))
    return labels


def _depluralize(phrase):
    """Singularise each word so 'spring mattresses' == 'spring mattress'."""
    return " ".join(w[:-1] if len(w) > 3 and w.endswith("s") else w
                    for w in _norm(phrase).split())


def _category_matches(accepts_category, product_labels):
    """
    An accepted category (e.g. 'Foam & latex mattresses') matches a product whose
    breadcrumb leaf / category label equals it (depluralised). Matching is on the
    *whole* phrase, not loose tokens, so 'Spring mattresses' does not match a
    'Foam & latex mattresses' product just because both contain 'mattress'.
    """
    want = _depluralize(accepts_category)
    for label in product_labels:
        lab = _depluralize(label)
        if want == lab:
            return True
        # Allow the accepted category to be the leaf within a longer label,
        # but require a full-word boundary match (not a substring of a word).
        if re.search(rf'(?:^|\W){re.escape(want)}(?:\W|$)', lab):
            return True
    return False


def _variant_finishes(group):
    """List the finishes of a group that actually have a downloaded GLB."""
    out = []
    for v in group.get("variants", []):
        if v.get("glb"):
            out.append({
                "article_number": v.get("article_number"),
                "finish": v.get("finish"),
                "glb": v.get("glb"),
            })
    return out


def resolve_compatible(active_group, catalog):
    """
    Return the catalogue *groups* compatible with active_group, keyed by accepted
    category. Each match carries the group's finishes (those with a GLB), so the
    app can offer any available finish of a compatible mattress / base.

    active_group / catalog are variant-group dicts (from load_catalog).
    """
    rule = active_group.get("compatibility") or {}
    accepts = rule.get("accepts_categories") or []
    want_size = rule.get("size")
    active_key = active_group.get("group_key")

    grouped = {category: [] for category in accepts}
    for group in catalog:
        if group.get("group_key") == active_key:
            continue
        labels = product_categories(group)
        gsize = group.get("size")
        finishes = _variant_finishes(group)
        if not finishes:
            continue  # nothing renderable yet
        for category in accepts:
            if not _category_matches(category, labels):
                continue
            # If both sides declare a size, it must match; otherwise soft-allow.
            if want_size and gsize and want_size != gsize:
                continue
            grouped[category].append({
                "group_key": group.get("group_key"),
                "name": group.get("product_name"),
                "size": gsize,
                "finishes": finishes,
            })
    return grouped


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Resolve compatible groups for a scraped model.")
    parser.add_argument("models_dir", help="Directory of scraped variant-group folders")
    parser.add_argument("group_key", help="group_key of the active model (folder name)")
    args = parser.parse_args()

    cat = load_catalog(args.models_dir)
    active = next((g for g in cat if g.get("group_key") == args.group_key), None)
    if not active:
        raise SystemExit(f"Group {args.group_key} not found in {args.models_dir}")
    result = resolve_compatible(active, cat)
    print(json.dumps(result, indent=2, ensure_ascii=False))

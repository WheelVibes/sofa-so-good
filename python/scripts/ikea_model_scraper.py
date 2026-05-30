import os
import re
import json
import asyncio
import argparse
import xml.etree.ElementTree as ET
# httpx and playwright are imported lazily inside the functions that use them
# (harvest_product_urls and main) so the pure helpers and the pytest suite can
# import this module without those packages installed.

from glb_analysis import analyze_glb
from categorize import design_classification

# --- CONFIGURATION ---
TARGET_SITEMAPS = [f"https://www.ikea.com/sitemaps/prod-en-SG_{i}.xml" for i in range(1, 5)]
OUTPUT_DIR = "./ikea_sg_3d_models"
PROGRESS_FILE = "processed_urls.txt"
CONCURRENT_PAGES = 3      # Reduced slightly to ensure domestic element rendering settles
TIMEOUT_MS = 30000

os.makedirs(OUTPUT_DIR, exist_ok=True)
file_lock = asyncio.Lock()

# Active output root: defaults to OUTPUT_DIR but can be overridden at runtime via
# main(out_dir=...) / the --out CLI flag. All runtime write paths go through
# output_root() so a sidecar can redirect group folders + processed_urls.txt.
_ACTIVE_OUTPUT_DIR = OUTPUT_DIR


def output_root():
    return _ACTIVE_OUTPUT_DIR


# NDJSON progress stream: when enabled (main(progress_ndjson=True) / the
# --progress-ndjson flag), emit one JSON line per phase transition on stdout so a
# Node sidecar can track per-product progress. Off by default; emits are no-ops.
_PROGRESS_NDJSON = False


def emit_progress(event):
    if _PROGRESS_NDJSON:
        import json as _json, sys as _sys
        _sys.stdout.write(_json.dumps(event) + "\n")
        _sys.stdout.flush()

class ScraperState:
    """Manages application-wide download metrics globally across concurrent tasks."""
    def __init__(self, limit):
        self.limit = limit  # 0 maps to absolute unlimited execution
        self.model_count = 0
        self.lock = asyncio.Lock()

    async def increment_if_under_limit(self):
        """Safely increments the model counter if the target boundary is clear."""
        async with self.lock:
            if self.limit == 0 or self.model_count < self.limit:
                self.model_count += 1
                return True
            return False

    async def is_limit_reached(self):
        """Returns True if the worker execution loop has matched its target boundary."""
        async with self.lock:
            if self.limit == 0:
                return False
            return self.model_count >= self.limit

def extract_article_number(url):
    """
    Pull the IKEA product number off the end of a /p/ product URL. Single
    articles are 8 digits (e.g. ``90499595``); combination/SPR products carry
    an ``s`` prefix (e.g. ``s09599419``). The ``s`` is significant — the
    products JSON endpoint 404s without it — so it must be preserved.
    """
    match = re.search(r'-(s?\d{8})/?(?:[#?].*)?$', url.rstrip("/"))
    return match.group(1) if match else None


def extract_size(*texts):
    """
    Normalise a bed/mattress size like '90x200 cm' / '90×200' to '90x200'.
    Checks each candidate text (e.g. the product title) in order.

    Skips multi-segment dimension strings such as a gateleg table's
    '39/95/151x90 cm' (extendable length / width), where the NNxNN is one
    entry in a slash-separated list rather than a single mattress size — those
    must not be mistaken for a bed size and used as the variant group key.
    """
    for text in texts:
        if not text:
            continue
        m = re.search(r'(?<![\d/])(\d{2,3})\s*[x×]\s*(\d{2,3})\s*cm', text, re.I)
        if m:
            return f"{m.group(1)}x{m.group(2)}"
    return None


async def fetch_product_json(client, article_number):
    """
    Fetch IKEA's structured product JSON (name/price/currency/category/series).
    The current PIP frontend no longer embeds __NEXT_DATA__; this endpoint
    (products/<last-3-digits>/<article>.json) is the reliable replacement.
    """
    if not article_number:
        return None
    api_url = f"https://www.ikea.com/sg/en/products/{article_number[-3:]}/{article_number}.json"
    try:
        resp = await client.get(api_url, timeout=20.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"[-] Product JSON fetch failed ({article_number}): {e}")
    return None


def parse_category_breadcrumbs(product_json):
    """Walk catalogRefs.products parents into an ordered breadcrumb list."""
    if not product_json:
        return []
    elements = (product_json.get("catalogRefs", {})
                            .get("products", {})
                            .get("elements", []))
    if not elements:
        return []
    leaf = elements[0]
    parents = leaf.get("parents", {}) or {}
    crumbs = sorted(parents.values(), key=lambda p: p.get("id", ""))
    names = [p.get("name") for p in crumbs if p.get("name")]
    if leaf.get("name"):
        names.append(leaf["name"])
    return names


# A product is treated as a set when EITHER signal fires. Detection is
# intentionally eager: a "set" that resolves to <2 members after discovery is
# demoted back to a normal product (see process_product_page), so false
# positives are self-correcting.
_SET_CATEGORY_RE = re.compile(r"\bsets?\b", re.I)
# "table and 2 folding chairs" / "...and chair"
_SET_TYPE_AND_RE = re.compile(r"\band\b.*\bchairs?\b", re.I)
# "2 folding chairs" / "4 chairs" — a leading count before a chair role word.
_SET_TYPE_COUNT_RE = re.compile(r"\b\d+\s+(?:folding\s+)?chairs?\b", re.I)


def is_set_product(product_json, category_hierarchy):
    """
    True if this product looks like a multi-piece set (table + chairs, dining
    set, etc.). Fires on EITHER:
      * category signal — any breadcrumb name matches /\\bsets?\\b/i;
      * type signal — type_name matches "<...> and chair(s)" or a leading
        count before a chair role word ("2 folding chairs").
    """
    type_name = (product_json or {}).get("typeName") or ""
    for crumb in category_hierarchy or []:
        if crumb and _SET_CATEGORY_RE.search(crumb):
            return True
    if _SET_TYPE_AND_RE.search(type_name):
        return True
    if _SET_TYPE_COUNT_RE.search(type_name):
        return True
    return False


def extract_product_json_fields(product_json):
    """
    Pull the rich structured fields IKEA exposes in the product JSON feed:
    name, type, price (incl/excl tax), currency, design/colour text, series,
    style group, global model id, hero image, and customer rating.
    Returns a dict of normalised values (missing fields omitted).
    """
    out = {}
    if not product_json:
        return out

    name = product_json.get("name")
    type_name = product_json.get("typeName")
    # "MALM" + "bed frame, high" -> "MALM bed frame, high"
    if name and type_name:
        out["product_name"] = f"{name} {type_name}".strip()
    elif name:
        out["product_name"] = name

    out["type_name"] = type_name
    out["price_tag"] = product_json.get("price")
    out["price_excl_tax"] = product_json.get("priceExclTax")
    out["price_numeral"] = product_json.get("priceNumeral")
    out["currency"] = product_json.get("currencyCode")
    out["design_text"] = product_json.get("validDesignText")
    out["style_group"] = product_json.get("styleGroup")
    out["global_model_id"] = product_json.get("globalId")

    series_elements = (product_json.get("catalogRefs", {})
                                  .get("series", {})
                                  .get("elements", []))
    if series_elements:
        out["series"] = series_elements[0].get("name")

    main_image = product_json.get("mainImage") or {}
    if main_image.get("url"):
        out["main_image_url"] = main_image["url"]
        out["main_image_alt"] = main_image.get("alt")

    context_image = (product_json.get("experimental", {})
                                 .get("contextualImage", {})) or {}
    if context_image.get("url"):
        out["contextual_image_url"] = context_image["url"]

    rating = (product_json.get("experimental", {}).get("rating", {})) or {}
    if rating.get("enabled") and rating.get("value") is not None:
        out["rating"] = {
            "value": rating.get("value"),
            "max": rating.get("maxValue"),
            "count": rating.get("count"),
        }

    # Drop keys whose value is None so the JSON stays clean.
    return {k: v for k, v in out.items() if v not in (None, "")}


async def scrape_measurements(page):
    """
    Open the Measurements modal and extract product dimensions plus per-package
    dimensions/weights. Returns {product: {name: value}, packages: [...]}.
    """
    result = {"product": {}, "packages": []}
    try:
        opened = await page.evaluate("""() => {
            const trigger = [...document.querySelectorAll('.pipf-list-view-item__action, button, a')]
                .find(e => /^measurements$/i.test((e.innerText || '').trim()));
            if (trigger) { trigger.click(); return true; }
            return false;
        }""")
        if not opened:
            return result
        await page.wait_for_timeout(1000)
        result = await page.evaluate("""() => {
            const root = document.querySelector('.pipf-measurements-modal');
            const out = { product: {}, packages: [] };
            if (!root) return out;
            const key = n => (n.innerText || '').replace(/:$/, '').replace(/\\s+/g, ' ').trim();
            // Product measurements: name node + sibling value within a wrapper.
            for (const nameEl of root.querySelectorAll('.pipf-measurements-modal__product-measurement-name')) {
                const wrap = nameEl.closest('.pipf-measurements-modal__product-measurement-wrapper');
                const label = key(nameEl);
                const value = wrap ? wrap.innerText.replace(nameEl.innerText, '').replace(/\\s+/g, ' ').trim() : '';
                if (label) out.product[label] = value;
            }
            // Each physical package is its own __package-measurement-container
            // ("Package 1", "Package 2", ...) under the single package-container.
            const pkgContainers = root.querySelectorAll('.pipf-measurements-modal__package-measurement-container');
            for (const pkg of pkgContainers) {
                const entry = {};
                const heading = pkg.querySelector('.pipf-measurements-modal__package-heading, .pipf-measurements-modal__package-header');
                if (heading) entry.label = heading.innerText.replace(/\\s+/g, ' ').trim();
                for (const n of pkg.querySelectorAll('.pipf-measurements-modal__package-measurement-name')) {
                    const wrap = n.closest('.pipf-measurements-modal__package-measurement-wrapper');
                    const k = key(n);
                    const v = wrap ? wrap.innerText.replace(n.innerText, '').replace(/\\s+/g, ' ').trim() : '';
                    if (k) entry[k] = v;
                }
                if (Object.keys(entry).length > (entry.label ? 1 : 0)) out.packages.push(entry);
            }
            return out;
        }""")
    except Exception as e:
        print(f"[-] Measurements scrape omitted: {e}")
    finally:
        try:
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(400)
        except Exception:
            pass
    return result


async def scrape_product_details(page):
    """
    Open the Product details modal and extract description, designer,
    'good to know', materials/care text, and document (PDF) links.
    """
    result = {}
    try:
        opened = await page.evaluate("""() => {
            const trigger = [...document.querySelectorAll('.pipf-list-view-item__action, button, a')]
                .find(e => /^product details$/i.test((e.innerText || '').trim()));
            if (trigger) { trigger.click(); return true; }
            return false;
        }""")
        if not opened:
            return result
        await page.wait_for_timeout(1100)
        # Scroll the modal to its bottom in steps so every lazily-rendered
        # section (esp. Materials & care) mounts, then wait for it to appear.
        for _ in range(6):
            await page.evaluate("""() => {
                const root = document.querySelector('.pipf-product-details-modal__container, .pipf-product-details-modal');
                if (root) root.scrollTop = root.scrollHeight;
            }""")
            await page.wait_for_timeout(350)
            has_material = await page.evaluate(
                """() => !!document.querySelector('.pipf-product-details-modal__material-header')""")
            if has_material:
                await page.wait_for_timeout(300)
                break

        raw = await page.evaluate("""() => {
            const root = document.querySelector('.pipf-product-details-modal__container, .pipf-product-details-modal');
            if (!root) return null;
            const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
            const docs = [...root.querySelectorAll('.pipf-product-details-modal__document-link, a[href$=".pdf"]')]
                .map(a => ({ text: clean(a.innerText), href: a.getAttribute('href') }))
                .filter(d => d.href);
            // Walk the section headers and content nodes in document order,
            // tagging each by its class so we can bucket reliably (headers are
            // h3.section-title / span.header / h4.material|care-header; body is
            // p.paragraph or p.label).
            const SEL = [
                '.pipf-product-details-modal__title',
                '.pipf-product-details-modal__section-title',
                '.pipf-product-details-modal__header',
                '.pipf-product-details-modal__material-header',
                '.pipf-product-details-modal__care-header',
                '.pipf-product-details-modal__paragraph',
                '.pipf-product-details-modal__label',
            ].join(',');
            const nodes = [...root.querySelectorAll(SEL)].map(e => {
                const cls = e.className.toString();
                let kind = 'body';
                if (/__title|__section-title|__header/.test(cls)) kind = 'header';
                else if (/__material-header|__care-header/.test(cls)) kind = 'subheader';
                return { kind, text: clean(e.innerText) };
            }).filter(n => n.text);
            // Material composition is a <dl> of <dt>part</dt><dd>composition</dd>.
            const materials = [];
            for (const dl of root.querySelectorAll('dl.pipf-product-details-modal__section')) {
                const part = clean(dl.querySelector('dt')?.innerText).replace(/:$/, '');
                const composition = clean(dl.querySelector('dd')?.innerText);
                if (composition) materials.push({ part, composition });
            }
            return { nodes, docs, materials };
        }""")
        if not raw:
            return result

        if raw.get("docs"):
            seen, docs = set(), []
            for d in raw["docs"]:
                href = d["href"]
                if href.startswith("/"):
                    href = f"https://www.ikea.com{href}"
                if href not in seen:
                    seen.add(href)
                    docs.append({"name": d["text"], "url": href})
            result["documents"] = docs

        # Bucket body nodes under the most recent header. Material composition is
        # captured separately as structured <dl> pairs (raw["materials"]); the
        # 'materials' bucket here only sweeps up any stray flat text.
        description_parts, good_to_know, care_parts = [], [], []
        bucket = "description"
        for node in raw.get("nodes", []):
            text = node["text"]
            low = text.lower().rstrip(":")
            if node["kind"] in ("header", "subheader"):
                if low == "good to know":
                    bucket = "good_to_know"
                elif low in ("materials and care", "material"):
                    bucket = "skip"  # composition handled via raw["materials"]
                elif low == "care":
                    bucket = "care"
                elif low == "designer":
                    bucket = "designer"
                elif low in ("product details", "safety and compliance",
                             "assembly and documents", "packaging"):
                    bucket = "skip"
                continue
            if bucket == "description":
                description_parts.append(text)
            elif bucket == "good_to_know":
                good_to_know.append(text)
            elif bucket == "care":
                care_parts.append(text)
            elif bucket == "designer":
                result["designer"] = text

        if description_parts:
            result["description"] = " ".join(description_parts)
        if good_to_know:
            result["good_to_know"] = good_to_know
        if care_parts:
            result["care_instructions"] = " ".join(care_parts)
        if raw.get("materials"):
            result["materials"] = raw["materials"]
    except Exception as e:
        print(f"[-] Product details scrape omitted: {e}")
    finally:
        try:
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(400)
        except Exception:
            pass
    return result


async def scrape_color_variants(page):
    """
    Collect colour/finish variants from the 'Choose colour' region. Each swatch
    links to a *sibling product* (a different article + its own GLB). Returns a
    list of {label, article_number, url} for the sibling finishes shown (the
    active product's own finish is added by the caller).
    """
    try:
        siblings = await page.evaluate("""() => {
            // Locate the 'Choose colour' heading and its surrounding region.
            const heading = [...document.querySelectorAll('h2, h3, span, div')]
                .find(e => /^choose colou?r/i.test((e.innerText || '').trim()));
            const region = heading ? (heading.closest('section, div') || document) : document;
            const out = [];
            for (const a of region.querySelectorAll('a[href*="/p/"][aria-label]')) {
                const label = (a.getAttribute('aria-label') || '').trim();
                // Colour swatch labels are short and comma-free; full product
                // names (e.g. "MALM, Bed frame ..., 90x200 cm") have commas.
                if (!label || label.length > 40 || label.includes(',')) continue;
                out.push({ label, href: a.getAttribute('href') });
            }
            // dedupe by href
            const seen = new Set(), uniq = [];
            for (const o of out) { if (!seen.has(o.href)) { seen.add(o.href); uniq.push(o); } }
            return uniq;
        }""")
        result = []
        for s in siblings or []:
            href = s["href"].split("#")[0]
            if href.startswith("/"):
                href = f"https://www.ikea.com{href}"
            result.append({
                "label": s["label"],
                "article_number": extract_article_number(href),
                "url": href,
            })
        return result
    except Exception:
        return []


def glb_from_ld_json(html_content):
    """
    The PIP page emits an ld+json {"@type":"3DModel"} block whose first
    encoding entry is the GLB. This avoids having to click 'View in 3D'.
    """
    for match in re.finditer(
        r'<script type="application/ld\+json">(.*?)</script>', html_content, re.DOTALL
    ):
        try:
            data = json.loads(match.group(1))
        except Exception:
            continue
        if isinstance(data, dict) and data.get("@type") == "3DModel":
            for media in data.get("encoding", []) or []:
                content_url = media.get("contentUrl")
                if content_url and ".glb" in content_url.lower():
                    return content_url
    return None


# A "What's included" list item wraps a member product. We slice the HTML into
# per-wrapper chunks and, inside each, read the dotted article (705.957.33), an
# optional name, an optional quantity ("2 ×" / "Qty 2"), and an optional member
# anchor. Dotted -> 8-digit article by stripping the dots.
_WRAPPER_SPLIT_RE = re.compile(r'pipf-list-view-item__wrapper')
_DOTTED_ART_RE = re.compile(r'\b(\d{3}\.\d{3}\.\d{2})\b')
_INCLUDED_NAME_RE = re.compile(
    r'pipf-list-view-item__name[^>]*>\s*(.*?)\s*<', re.I | re.DOTALL)
_INCLUDED_QTY_RE = re.compile(
    r'(?:qty\s*|x\s*)?(\d+)\s*(?:&times;|×|x\b)', re.I)
_INCLUDED_HREF_RE = re.compile(r'href="([^"]*/p/[^"]*-\d{8}/?[^"]*)"', re.I)


def _dotted_to_article(dotted):
    """'705.957.33' -> '70595733'."""
    return dotted.replace(".", "")


def extract_included_articles(html, set_article):
    """
    Parse the page's "What's included" section for member products.

    Returns a list of dicts (page order, de-duplicated by article):
      { "article_number": "70595733",
        "name": "VIHALS gateleg table, white" | None,
        "included_count": 2 | None,
        "url": "https://www.ikea.com/sg/en/p/...-70595733/" | None }

    The set's own article (set_article, with any leading 's' / dots stripped)
    is excluded. Returns [] when the section is absent.
    """
    own = re.sub(r"\D", "", set_article or "")  # 's69599421' -> '69599421'
    chunks = _WRAPPER_SPLIT_RE.split(html)
    members, seen = [], set()
    # chunks[0] is everything before the first wrapper; skip it.
    for chunk in chunks[1:]:
        m = _DOTTED_ART_RE.search(chunk)
        if not m:
            continue
        art = _dotted_to_article(m.group(1))
        if art == own or art in seen:
            continue
        seen.add(art)

        name_m = _INCLUDED_NAME_RE.search(chunk)
        name = name_m.group(1).strip() if name_m else None

        qty_m = _INCLUDED_QTY_RE.search(chunk)
        included_count = int(qty_m.group(1)) if qty_m else None

        href_m = _INCLUDED_HREF_RE.search(chunk)
        url = None
        if href_m:
            href = href_m.group(1).split("#")[0]
            url = f"https://www.ikea.com{href}" if href.startswith("/") else href

        members.append({
            "article_number": art,
            "name": name,
            "included_count": included_count,
            "url": url,
        })
    return members


# Role -> the singular/plural noun(s) it appears as in a type_name, so we can
# find a leading count ("2 folding chairs" -> 2 for the chair role).
_ROLE_NOUNS = {
    "table": r"tables?",
    "chair": r"chairs?",
    "bench": r"benches?",
    "stool": r"stools?",
}


def quantity_for_role(role, type_name, included_count):
    """
    Resolve how many of this member the set contains, in priority order:
      1. explicit count from the included list (included_count), if given;
      2. a leading integer before this role's noun in type_name
         ("table and 2 folding chairs" -> chair=2; table has no count -> falls
         through);
      3. default 1.
    """
    if included_count is not None:
        return included_count
    noun = _ROLE_NOUNS.get(role)
    if noun and type_name:
        m = re.search(rf"\b(\d+)\s+(?:[a-z]+\s+)?{noun}\b", type_name, re.I)
        if m:
            return int(m.group(1))
    return 1


# A member's role in the set. type_name keywords are checked first (most
# specific), then the functional design.category as a fallback.
_ROLE_TYPE_RULES = [
    (re.compile(r"\bstool\b", re.I), "stool"),
    (re.compile(r"\bbench\b", re.I), "bench"),
    (re.compile(r"\bchair\b", re.I), "chair"),
    (re.compile(r"\b(table|desk)\b", re.I), "table"),
]
# Functional category (from categorize.py) -> role, when type_name is unhelpful.
_ROLE_CATEGORY_FALLBACK = {
    "tables": "table",
    "seating": "chair",
}


def classify_member_role(design_category, type_name):
    """
    Classify a set member as one of: table | chair | bench | stool | other.
    Prefers explicit type_name keywords; falls back to the member's functional
    design.category (tables->table, seating->chair); else "other".
    """
    t = type_name or ""
    for pattern, role in _ROLE_TYPE_RULES:
        if pattern.search(t):
            return role
    return _ROLE_CATEGORY_FALLBACK.get(design_category, "other")


def build_set_recipe(set_key, set_name, set_article, series, style_group,
                     design_text, member_source, members):
    """
    Assemble the set recipe object written to sets/<set_key>.json. Members are
    referenced by group_key (not duplicated). Keys with None values for the
    optional descriptive fields are kept (the spec schema lists them), but
    callers pass through whatever the product JSON had.

    members: list of {group_key, role, qty, article_number}.
    """
    return {
        "set_key": set_key,
        "set_name": set_name,
        "set_article": set_article,
        "series": series,
        "style_group": style_group,
        "design_text": design_text,
        "member_source": member_source,
        "members": members,
    }


async def write_set_recipe(output_root, recipe):
    """
    Write a set recipe to <output_root>/sets/<set_key>.json. Returns the path.
    Concurrency-safe via groups_lock (shares the variant-group writer's lock).
    """
    sets_dir = os.path.join(output_root, "sets")
    path = os.path.join(sets_dir, f"{recipe['set_key']}.json")
    async with groups_lock:
        os.makedirs(sets_dir, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(recipe, f, indent=4, ensure_ascii=False)
    print(f"[==>] Wrote set recipe: {path} "
          f"({len(recipe.get('members', []))} members, "
          f"source={recipe.get('member_source')})")
    return path


def _series_fallback_members(series):
    """
    Series-match fallback (Part 1 §1.2 B) — LOWER PRIORITY, intentionally a
    minimal stub. A full implementation would query the IKEA series/category
    listing for standalone table + chair members and match by series + finish.
    For now it returns [] and is flagged member_source="series" so such sets are
    logged for manual review rather than silently shipped.
    """
    # TODO(part1-followup): query series listing + match roles by finish text.
    return []


def discover_set_members_from_html(html, set_article, series=None):
    """
    Decide the member list + source from already-fetched page HTML (no network).
      * Primary: "What's included" articles (page order, set excluded).
      * Fallback: series match (stub) when the section is absent AND a series
        is known -> source "series".
    Returns (members, member_source) where member_source is "included"|"series".
    """
    included = extract_included_articles(html, set_article)
    if included:
        return included, "included"
    if series:
        fallback = _series_fallback_members(series)
        return fallback, "series"
    return [], "included"


async def discover_set_members(page, product_json, set_article):
    """
    Discover a set's member products from the live page. Reads the page HTML and
    delegates to discover_set_members_from_html. Returns (members, source);
    each member is a dict {article_number, name, included_count, url}.
    """
    html = await page.content()
    series = None
    series_elements = ((product_json or {}).get("catalogRefs", {})
                       .get("series", {}).get("elements", []))
    if series_elements:
        series = series_elements[0].get("name")
    members, source = discover_set_members_from_html(html, set_article, series)
    if source == "series":
        print(f"[-] Set {set_article}: 'What's included' absent; using "
              f"lower-confidence series fallback (members={len(members)})")
    else:
        print(f"[+] Set {set_article}: discovered {len(members)} member(s) "
              f"from 'What's included'")
    return members, source


def should_demote_set(members):
    """
    A "set" with fewer than 2 resolved members is demoted to a normal product
    (Part 1 §1.5): no recipe is written and the combined GLB IS downloaded
    (it's the only model we have). Returns True to demote.
    """
    return len(members) < 2


async def scrape_complete_with(page):
    """
    Scrape the 'Complete with' compatibility module.

    Compatibility is organised as category pills (e.g. 'Spring mattresses',
    'Slatted bed bases', 'Foam & latex mattresses'); only the active pill's
    products are in the DOM, so each pill must be clicked in turn. Returns a
    list of {category, products:[{article_number, name, url}]} groups.
    """
    try:
        root = await page.query_selector(".pipf-complete-with, .js-pip-upsell")
        if not root:
            return []
    except Exception:
        return []

    # Enumerate the category pill labels (role=radio buttons).
    pill_labels = await page.evaluate("""() => {
        const root = document.querySelector('.pipf-complete-with, .js-pip-upsell');
        if (!root) return [];
        return [...root.querySelectorAll('.pipf-complete-with__pill, [role=radio]')]
            .map(b => b.innerText.replace(/\\s+/g, ' ').trim())
            .filter(Boolean);
    }""")
    # No pills => single ungrouped list; treat as one anonymous category.
    if not pill_labels:
        pill_labels = [None]

    def collect_active():
        return page.evaluate("""() => {
            const root = document.querySelector('.pipf-complete-with, .js-pip-upsell');
            if (!root) return [];
            const seen = new Set(), out = [];
            for (const a of root.querySelectorAll('a[href*="/p/"]')) {
                let href = a.getAttribute('href');
                if (!href || seen.has(href)) continue;
                seen.add(href);
                const name = (a.innerText || '').replace(/\\s+/g, ' ').trim();
                out.push({ href, name });
            }
            return out;
        }""")

    groups = []
    for label in pill_labels:
        if label is not None:
            await page.evaluate("""(lab) => {
                const root = document.querySelector('.pipf-complete-with, .js-pip-upsell');
                if (!root) return;
                const pills = [...root.querySelectorAll('.pipf-complete-with__pill, [role=radio]')];
                const pill = pills.find(p => p.innerText.replace(/\\s+/g, ' ').trim() === lab);
                if (pill) pill.click();
            }""", label)
            await page.wait_for_timeout(900)

        raw_items = await collect_active()
        products = []
        for it in raw_items:
            href = it["href"]
            if href.startswith("/"):
                href = f"https://www.ikea.com{href}"
            art = extract_article_number(href)
            # The URL slug is the cleanest product name; the DOM text/aria/alt
            # on these cards is image-description boilerplate, so prefer the slug.
            slug = re.search(r'/p/([a-z0-9-]+?)-\d{8}/?', href)
            name = slug.group(1).replace("-", " ").strip() if slug else it["name"]
            products.append({
                "article_number": art,
                "name": name,
                "url": href,
            })
        groups.append({"category": label or "Complete with", "products": products})
    return groups


def processed_urls_path():
    # Default behaviour: bare relative PROGRESS_FILE (CWD), byte-for-byte as
    # before. Only when --out overrides the output root does the file follow it.
    if _ACTIVE_OUTPUT_DIR == OUTPUT_DIR:
        return PROGRESS_FILE
    return os.path.join(output_root(), PROGRESS_FILE)

def load_processed_urls():
    path = processed_urls_path()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return set(line.strip() for line in f if line.strip())
    return set()

async def log_processed_url(url):
    path = processed_urls_path()
    async with file_lock:
        with open(path, "a", encoding="utf-8") as f:
            f.write(f"{url}\n")

async def harvest_product_urls(sitemap_urls):
    import httpx
    product_urls = []
    namespace = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for sitemap_url in sitemap_urls:
            print(f"[*] Extracting routing links from sitemap: {sitemap_url}")
            try:
                response = await client.get(sitemap_url)
                if response.status_code == 200:
                    root = ET.fromstring(response.content)
                    urls = [loc.text for loc in root.findall(".//ns:loc", namespace)]
                    product_urls.extend(urls)
            except Exception as e:
                print(f"[-] Sitemap error: {e}")
    return product_urls

# Variant groups: sibling products that differ only by colour/finish are stored
# together in one folder containing every variant's GLB plus a single
# metadata.json (shared specs at the top, per-finish data under "variants").
# The group key is derived from product name + type + size, which is identical
# across finishes of the same model. The crawl visits one variant URL at a time,
# so the folder accretes: each scraped variant drops in its GLB and merges itself
# into the shared metadata.json; not-yet-crawled siblings appear with glb=null.
groups_lock = asyncio.Lock()


def variant_group_key(product_name, type_name, size, product_title=None):
    """
    Build a stable slug shared by all finishes of one model, e.g.
    'malm-bed-frame-high-90x200'. product_name already embeds type_name
    ("MALM bed frame, high"), so type_name is only a fallback.

    The name source is chosen so the key is never built from dimensions
    alone: structured product_name first, then type_name, then the page <h1>
    (product_title) as a last resort. ``size`` is only ever a *suffix* — if no
    name field is available it is dropped rather than allowed to stand in as
    the whole key (which produced dimension-named folders like '151x90/').
    """
    # Strip a leading "SERIES / " breadcrumb duplicate from the <h1> fallback.
    title = (product_title or "").split("/")[-1].strip() if product_title else ""
    base = product_name or type_name or title
    if not base:
        return "ungrouped"
    # Append size only to a structured-field base. The <h1> fallback already
    # embeds the size ("..., 90x200 cm"), so appending again would duplicate
    # it; the structured product_name/type_name never carry the size.
    suffix = size if (product_name or type_name) else ""
    raw = " ".join(p for p in (base, suffix or "") if p)
    slug = re.sub(r'[^a-z0-9]+', "-", raw.lower()).strip("-")
    return slug or "ungrouped"


def finish_slug(label, article_number):
    """Filesystem-safe stem for a variant's GLB, e.g. 'white-stained-oak-veneer'."""
    base = re.sub(r'[^a-z0-9]+', "-", (label or "").lower()).strip("-")
    return base or (article_number or "variant")


async def merge_variant_group(group_dir, shared_meta, variant_entry, sibling_finishes):
    """
    Merge one scraped variant into the group folder's single metadata.json.

    shared_meta   — specs identical across finishes (name, measurements, materials,
                    compatibility, etc.); written once / refreshed each visit.
    variant_entry — this finish's own data (article, finish label, price, glb path,
                    global_model_id, colour, url). Keyed by article number.
    sibling_finishes — finishes seen on the page but not yet crawled; added as
                    stubs (glb=null) so the variant list is complete sooner.

    Concurrency-safe via groups_lock; idempotent on article number.
    """
    os.makedirs(group_dir, exist_ok=True)
    path = os.path.join(group_dir, "metadata.json")
    async with groups_lock:
        data = {}
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, json.JSONDecodeError):
                data = {}

        # Refresh shared specs (latest crawl wins; values are finish-independent).
        for key, value in shared_meta.items():
            if value not in (None, "", [], {}):
                data[key] = value

        # Merge variants by article number.
        variants = {v.get("article_number"): v for v in data.get("variants", [])
                    if v.get("article_number")}
        # Add sibling stubs first so a real entry can override them.
        for sib in sibling_finishes:
            art = sib.get("article_number")
            if art and art not in variants:
                variants[art] = {
                    "article_number": art,
                    "finish": sib.get("label"),
                    "url": sib.get("url"),
                    "glb": None,
                }
        # This crawled variant overrides/fills its own entry.
        art = variant_entry.get("article_number")
        if art:
            existing = variants.get(art, {})
            variants[art] = {**existing, **{k: v for k, v in variant_entry.items()
                                            if v not in (None, "")}}

        # Crawled variants (with a GLB) sort ahead of not-yet-crawled stubs.
        data["variants"] = sorted(
            variants.values(),
            key=lambda v: (v.get("glb") is None, v.get("finish") or ""),
        )
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            n_glb = sum(1 for v in data["variants"] if v.get("glb"))
            print(f"[+] Group {os.path.basename(group_dir)}: "
                  f"{len(data['variants'])} variants ({n_glb} with GLB)")
        except OSError as e:
            print(f"[-] Failed writing group metadata {path}: {e}")

async def download_glb(client, url, product_dir, filename_stem):
    """Download a GLB into product_dir as <filename_stem>.glb. Returns the
    relative filename on success (so it can be recorded in metadata), else None."""
    clean_stem = re.sub(r'[\\/*?:"<>|]', "", (filename_stem or "model").strip().split('\n')[0])
    filename = f"{clean_stem}.glb"
    filepath = os.path.join(product_dir, filename)

    if os.path.exists(filepath):
        print(f"[~] Mesh file already exists locally: {filename}")
        return filename
    try:
        print(f"[!] Downloading 3D mesh asset: {filename}")
        response = await client.get(url, timeout=60.0)
        if response.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(response.content)
            print(f"[+] Saved structural model mesh: {filepath}")
            return filename
    except Exception as e:
        print(f"[-] Network transaction failure grabbing asset: {e}")
    return None

async def process_product_page(context, http_client, url, state,
                               is_test_mode=False, visited=None, depth=0):
    if visited is None:
        visited = set()
    canon = url.split("#")[0]
    if canon in visited:
        print(f"[~] Skipping already-visited product: {canon}")
        return
    visited.add(canon)
    page = await context.new_page()
    glb_url = None
    product_title = "unnamed_product"

    async def intercept_network_request(request):
        nonlocal glb_url
        if ".glb" in request.url.lower():
            glb_url = request.url

    page.on("request", intercept_network_request)

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT_MS)

        # 1. TITLE (cleaned of hidden newline/space runs)
        product_title = "unnamed_product"
        title_el = await page.query_selector("h1")
        if title_el:
            raw_title = await title_el.inner_text()
            product_title = " ".join(raw_title.split())

        html_content = await page.content()

        # 2. STRUCTURED PRODUCT JSON
        # The PIP frontend dropped __NEXT_DATA__; the article number lives in the
        # URL and resolves to a clean products/<last3>/<art>.json feed carrying
        # price, currency, category, series, image, rating and style group.
        item_id = extract_article_number(url)
        product_json = await fetch_product_json(http_client, item_id)
        json_fields = extract_product_json_fields(product_json)
        category_breadcrumbs = parse_category_breadcrumbs(product_json)

        # DOM fallbacks for the few JSON fields that can be absent.
        if not item_id:
            id_el = await page.query_selector(".pipf-product-identifier__value, [data-product-number]")
            if id_el:
                item_id = re.sub(r'\D', '', (await id_el.inner_text()) or "") or None
        if not category_breadcrumbs:
            bc_elements = await page.query_selector_all(
                ".pipf-breadcrumb__link, .pip-breadcrumbs__list-item-link, .pip-breadcrumbs__link")
            category_breadcrumbs = [(await bc.inner_text()).strip()
                                    for bc in bc_elements if (await bc.inner_text())]

        # 2b. SET DECOMPOSITION — a multi-piece set (e.g. "table and 2 folding
        # chairs") is delivered as one fused GLB we can't split, so instead we
        # discover its standalone member products, scrape each via this same
        # path (reusing `visited`), and emit a sets/<set_key>.json recipe. The
        # set's own fused GLB is NOT downloaded. A set that resolves to <2
        # members is demoted: we fall through and scrape it as a normal product.
        if depth == 0 and is_set_product(product_json, category_breadcrumbs):
            members, member_source = await discover_set_members(
                page, product_json, item_id)

            if should_demote_set(members):
                print(f"[-] Set {item_id} resolved to {len(members)} member(s) "
                      f"(<2): demoting to a normal product (downloading its GLB).")
                # fall through to the standard single-product flow below.
            else:
                resolved = []
                for mem in members:
                    member_url = mem.get("url") or (
                        f"https://www.ikea.com/sg/en/p/-{mem['article_number']}/")
                    # Scrape the member as an ordinary standalone product. The
                    # bare -<art>/ slug 301-redirects to the canonical URL;
                    # Playwright follows it and the extractor reads the canonical
                    # URL after navigation. Reuses `visited` so a member already
                    # scraped standalone is not re-downloaded.
                    await process_product_page(context, http_client, member_url,
                                               state, is_test_mode, visited,
                                               depth=depth + 1)
                    # Resolve the member's group_key + role from its own JSON.
                    member_json = await fetch_product_json(http_client,
                                                           mem["article_number"])
                    member_fields = extract_product_json_fields(member_json)
                    member_crumbs = parse_category_breadcrumbs(member_json)
                    member_size = extract_size(member_fields.get("type_name"),
                                               member_fields.get("design_text"))
                    member_group_key = variant_group_key(
                        member_fields.get("product_name"),
                        member_fields.get("type_name"), member_size)
                    member_design = design_classification(
                        member_crumbs, member_fields.get("type_name"))
                    role = classify_member_role(member_design.get("category"),
                                                member_fields.get("type_name"))
                    qty = quantity_for_role(role, json_fields.get("type_name"),
                                            mem.get("included_count"))
                    resolved.append({
                        "group_key": member_group_key,
                        "role": role,
                        "qty": qty,
                        "article_number": mem["article_number"],
                    })

                set_key = variant_group_key(json_fields.get("product_name"),
                                            json_fields.get("type_name"), None,
                                            product_title)
                set_name = json_fields.get("product_name") or product_title
                recipe = build_set_recipe(
                    set_key=set_key,
                    set_name=set_name,
                    set_article=item_id,
                    series=json_fields.get("series"),
                    style_group=json_fields.get("style_group"),
                    design_text=json_fields.get("design_text"),
                    member_source=member_source,
                    members=resolved,
                )
                await write_set_recipe(output_root(), recipe)
                if not is_test_mode:
                    await log_processed_url(url)
                await page.close()
                return

        # 3. PRODUCT SUMMARY DESCRIPTION (visible, above the fold)
        summary_description = await page.evaluate(
            """() => document.querySelector('.pipf-product-summary__description')
                        ?.innerText?.replace(/\\s+/g, ' ').trim() || null""")

        # Scroll the whole page once so lazy modules (variants, complete-with,
        # reviews) mount before we interact with them.
        for y in range(0, 10000, 600):
            await page.evaluate(f"window.scrollTo(0, {y})")
            await page.wait_for_timeout(120)
        await page.wait_for_timeout(700)
        await page.evaluate("window.scrollTo(0, 0)")
        await page.wait_for_timeout(300)

        # 4. COLOUR / FINISH VARIANTS
        # The JSON design text ("black-brown") is this product's own finish; the
        # "Choose colour" swatches are *sibling products* (each a distinct GLB).
        active_finish = json_fields.get("design_text")
        # Sibling finishes (other articles) shown in the 'Choose colour' row; the
        # active finish is recorded separately as this variant's own entry.
        sibling_finishes = [s for s in await scrape_color_variants(page)
                            if s.get("article_number") != item_id]

        # 5. MEASUREMENTS (product dimensions + package dimensions/weights)
        measurements = await scrape_measurements(page)
        # Normalise keys: drop any trailing colon the DOM leaves on labels.
        measurements["product"] = {k.rstrip(":").strip(): v
                                   for k, v in measurements.get("product", {}).items()}
        measurements["packages"] = [{k.rstrip(":").strip(): v for k, v in pkg.items()}
                                    for pkg in measurements.get("packages", [])]

        # 6. PRODUCT DETAILS (description, designer, good-to-know, materials, docs)
        details = await scrape_product_details(page)

        # 7. COMPATIBILITY ("Complete with") — hybrid model. The page's
        # "Complete with" pills name the categories of accepted accessories
        # (e.g. Spring mattresses, Slatted bed bases, Foam & latex mattresses);
        # the full per-category product list lives behind a "Show more" sidebar
        # and goes stale quickly. We therefore store the *category rule* + the
        # constraining size and let the app resolve concrete products against
        # its own catalogue at load time. A few example products seen inline are
        # kept purely as a reference sample.
        compatibility = {}
        try:
            for y in range(0, 9000, 600):
                await page.evaluate(f"window.scrollTo(0, {y})")
                await page.wait_for_timeout(120)
            await page.wait_for_timeout(600)
            groups = await scrape_complete_with(page)
            accepts = [g["category"] for g in groups
                       if g.get("category") and g["category"] != "Complete with"]
            size = extract_size(product_title,
                                json_fields.get("design_text"))
            if accepts or size:
                compatibility = {
                    "accepts_categories": accepts,
                    "size": size,
                    "example_products": [
                        {"category": g["category"], **p}
                        for g in groups for p in g.get("products", [])
                    ],
                }
        except Exception as e:
            print(f"[-] Complete-with scrape omitted: {e}")

        # 8. 3D MODEL — prefer the ld+json 3DModel block, then the viewer button,
        # then any .glb seen on the wire or embedded in the HTML.
        glb_url = glb_url or glb_from_ld_json(html_content)
        if not glb_url:
            threed_selectors = ["button:has-text('View in 3D')", "button:has-text('3D view')",
                                 "button:has-text('Run in 3D')", ".pip-media-grid__3d-button"]
            for selector in threed_selectors:
                trigger_element = await page.query_selector(selector)
                if trigger_element and await trigger_element.is_visible():
                    await trigger_element.scroll_into_view_if_needed()
                    await trigger_element.click(force=True)
                    await page.wait_for_timeout(4000)
                    break
        if not glb_url:
            model_viewer_el = await page.query_selector("model-viewer")
            if model_viewer_el:
                glb_url = await model_viewer_el.get_attribute("src")
        if not glb_url:
            hidden_urls = re.findall(r'(https://[^\s"\']+\.glb)', html_content, re.IGNORECASE)
            if hidden_urls:
                glb_url = hidden_urls[0]

        # 9. ASSEMBLE + SAVE
        if glb_url:
            if glb_url.startswith("//"):
                glb_url = f"https:{glb_url}"
            elif glb_url.startswith("/"):
                glb_url = f"https://www.ikea.com{glb_url}"

            if await state.is_limit_reached():
                return False

            # All finishes of this model share one group folder; the GLB is named
            # by finish so siblings coexist (e.g. black-brown.glb, white.glb).
            size = extract_size(product_title, json_fields.get("design_text"))
            group_key = variant_group_key(json_fields.get("product_name"),
                                          json_fields.get("type_name"), size,
                                          product_title)
            group_dir = os.path.join(output_root(), group_key)
            os.makedirs(group_dir, exist_ok=True)

            glb_stem = finish_slug(active_finish, item_id)
            emit_progress({"group": group_key, "finish": active_finish,
                           "glb": f"{glb_stem}.glb", "phase": "scraping"})
            glb_filename = await download_glb(http_client, glb_url, group_dir, glb_stem)
            if glb_filename:
                emit_progress({"group": group_key, "finish": active_finish,
                               "glb": glb_filename, "phase": "glb_written"})
                description = details.get("description") or summary_description

                # Analyse the downloaded GLB for geometry (footprint/anchor) and
                # the per-component renderable palette (the interior-design data
                # the page metadata can't provide).
                glb_info = {}
                try:
                    glb_info = analyze_glb(os.path.join(group_dir, glb_filename))
                except Exception as e:
                    print(f"[-] GLB analysis omitted: {e}")
                footprint = glb_info.get("footprint")

                # Functional category + placement semantics for design tooling.
                design = design_classification(category_breadcrumbs,
                                               json_fields.get("type_name"),
                                               footprint)

                # Specs that are identical across finishes of the same model.
                shared_meta = {
                    "group_key": group_key,
                    "product_name": json_fields.get("product_name"),
                    "type_name": json_fields.get("type_name"),
                    "size": size,
                    "series": json_fields.get("series"),
                    "style_group": json_fields.get("style_group"),
                    "designer": details.get("designer"),
                    "description": description,
                    "good_to_know": details.get("good_to_know"),
                    "category_hierarchy": category_breadcrumbs,
                    "design": design,
                    "product_measurements": measurements.get("product", {}),
                    "package_measurements": measurements.get("packages", []),
                    "compatibility": compatibility,
                }

                # Finish-specific data for this variant.
                variant_entry = {
                    "article_number": item_id,
                    "finish": active_finish,
                    "url": url.split("#")[0],
                    "product_title": product_title.strip(),
                    "price_tag": json_fields.get("price_tag"),
                    "price_excl_tax": json_fields.get("price_excl_tax"),
                    "price_numeral": json_fields.get("price_numeral"),
                    "currency": json_fields.get("currency"),
                    "rating": json_fields.get("rating"),
                    "materials": details.get("materials", []),
                    "care_instructions": details.get("care_instructions"),
                    "documents": details.get("documents", []),
                    "main_image_url": json_fields.get("main_image_url"),
                    "contextual_image_url": json_fields.get("contextual_image_url"),
                    "global_model_id": json_fields.get("global_model_id"),
                    "model_asset_url": glb_url,
                    "glb": glb_filename,
                    # Per-finish geometry + 3D palette/segments (footprint can
                    # differ across finishes, e.g. a wider headboard variant).
                    "footprint": footprint,
                    "glb_materials": glb_info.get("materials", []),
                    "glb_segments": glb_info.get("segments", []),
                }

                await merge_variant_group(group_dir, shared_meta, variant_entry,
                                          sibling_finishes)
                emit_progress({"group": group_key, "phase": "metadata_written"})

                counted = await state.increment_if_under_limit()
                if counted:
                    print(f"[==>] Saved: {product_title} ({state.model_count} total models)")
                emit_progress({"group": group_key, "finish": active_finish,
                               "glb": glb_filename, "phase": "done"})
            else:
                emit_progress({"group": group_key, "finish": active_finish,
                               "phase": "failed"})
        else:
            print(f"[-] Could not extract GLB asset path array link for: {url}")

        if not is_test_mode:
            await log_processed_url(url)

    except Exception as e:
        print(f"[-] Processing crash on {url}: {e}")
    finally:
        await page.close()

async def queue_worker(queue, context, http_client, state, is_test_mode=False,
                       visited=None):
    if visited is None:
        visited = set()
    while not queue.empty():
        if await state.is_limit_reached():
            break
        url = await queue.get()
        try:
            await process_product_page(context, http_client, url, state,
                                       is_test_mode, visited)
        finally:
            queue.task_done()

async def main(limit, target_url, out_dir=None, progress_ndjson=False):
    import httpx
    from playwright.async_api import async_playwright

    global _ACTIVE_OUTPUT_DIR, _PROGRESS_NDJSON
    _PROGRESS_NDJSON = progress_ndjson
    if out_dir:
        _ACTIVE_OUTPUT_DIR = out_dir
        os.makedirs(_ACTIVE_OUTPUT_DIR, exist_ok=True)

    state = ScraperState(limit)
    is_test_mode = target_url is not None

    if is_test_mode:
        pending_urls = [target_url]
    else:
        processed_urls = load_processed_urls()
        all_urls = await harvest_product_urls(TARGET_SITEMAPS)
        if not all_urls:
            return
        pending_urls = [url for url in all_urls if url not in processed_urls]

    if not pending_urls:
        print("[+] Content up to date.")
        return

    emit_progress({"phase": "run_started", "total": len(pending_urls)})

    url_queue = asyncio.Queue()
    for url in pending_urls:
        await url_queue.put(url)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-web-security", "--allow-running-insecure-content"]
        )
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 720}
        )

        async with httpx.AsyncClient(follow_redirects=True) as http_client:
            num_workers = 1 if is_test_mode else CONCURRENT_PAGES
            visited = set()
            workers = [
                asyncio.create_task(queue_worker(url_queue, context, http_client,
                                                 state, is_test_mode, visited))
                for _ in range(num_workers)
            ]
            await asyncio.gather(*workers)

        await browser.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", "--limit", type=int, default=0)
    parser.add_argument("-u", "--url", type=str, default=None)
    parser.add_argument("--out", type=str, default=None,
                        help="Output root for group folders + processed_urls.txt")
    parser.add_argument("--progress-ndjson", action="store_true",
                        help="Emit one JSON line per phase transition on stdout")
    args = parser.parse_args()
    asyncio.run(main(args.limit, args.url, out_dir=args.out,
                     progress_ndjson=args.progress_ndjson))

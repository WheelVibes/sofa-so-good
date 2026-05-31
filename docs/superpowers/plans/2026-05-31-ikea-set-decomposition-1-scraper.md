# IKEA Set Decomposition — Part 1 (Scraper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the IKEA scraper detect multi-piece *sets* (e.g. "VIHALS table and 2 folding chairs"), discover their member products from the page's "What's included" section, scrape each member via the existing single-product path, and emit a `sets/<set_key>.json` recipe (members + counts + roles) — demoting any "set" that resolves to fewer than 2 members back to a normal product.

**Architecture:** All work is in `python/scripts/ikea_model_scraper.py` plus a new pytest file. The set logic is a small layer of **pure, network-free helper functions** (`is_set_product`, dotted-article extraction, quantity parsing, role classification, recipe assembly) that are unit-tested against saved HTML/JSON fixtures, plus two `async` orchestration functions (`discover_set_members`, set branch inside `process_product_page`) that reuse the existing single-product extraction, `variant_group_key`, and limit/visited bookkeeping. The set itself does **not** download its fused GLB; members are scraped as ordinary standalone products and referenced by `group_key`.

**Tech Stack:** Python 3.11, asyncio, Playwright (`async_api`), httpx, pytest. Tests use saved fixtures only — **no network, no browser**.

---

## Pre-flight: test runner + import constraint (read before Task 1)

The repo's JS suite is Vitest; **Python tests run with pytest** from `python/scripts/`:

```bash
cd python/scripts && python -m pytest test_set_decomposition.py -v
```

`pytest` is already installed (8.3.x). If a fresh environment lacks it:

```bash
pip install pytest
```

**Critical constraint discovered during planning:** `ikea_model_scraper.py` does
`import httpx` and `from playwright.async_api import async_playwright` at module
top level. In the test/CI environment **neither package is importable**, so a
test that does `import ikea_model_scraper` fails at collection time with
`ModuleNotFoundError: No module named 'httpx'`. Both imports are only ever used
*inside functions* (`httpx.AsyncClient` at lines 502 & 914; `async_playwright`
at line 904) — never at import time. **Task 1 makes these two imports lazy** so
the pure helpers can be imported and unit-tested with no heavy deps and no
network. Every later task depends on this.

---

## File structure

- **Modify** `python/scripts/ikea_model_scraper.py`
  - Task 1: lazy-import `httpx` / `async_playwright`.
  - Task 2: `is_set_product(product_json, category_hierarchy)`.
  - Task 3: `extract_included_articles(html, set_article)`.
  - Task 4: `quantity_for_role(role, type_name, included_count)`.
  - Task 5: `classify_member_role(design_category, type_name)`.
  - Task 6: `build_set_recipe(...)` + `write_set_recipe(...)`.
  - Task 7: `async discover_set_members(page, product_json, set_article)`
    (primary "What's included" + minimal stubbed series fallback).
  - Task 8: set branch in `process_product_page` (member scrape via existing
    path with visited reuse; <2-member demotion).
- **Create** `python/scripts/test_set_decomposition.py` (pytest, no network).
- **Create** fixtures:
  - `python/scripts/tests/fixtures/whats_included.html`
  - `python/scripts/tests/fixtures/set_product.json`
  - `python/scripts/tests/fixtures/__init__.py` is **not** needed; tests read
    files by path.

Match the existing file's style throughout: module-level functions, asyncio +
playwright + httpx, print-based logging with `[+]` / `[-]` / `[==>]` /
`[~]` / `[!]` prefixes.

---

### Task 1: Make `httpx` / `playwright` imports lazy (enabling refactor)

So the pure helpers (and the test file) can `import ikea_model_scraper` without
those packages installed. No behaviour change for the real crawl.

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py:1-8` (top imports), `:500-503`
  (`harvest_product_urls`), `:902-915` (`main`).
- Test: `python/scripts/test_set_decomposition.py`

- [ ] **Step 1: Create the fixtures dir and a placeholder so the test file has a home**

```bash
mkdir -p python/scripts/tests/fixtures
```

- [ ] **Step 2: Write the failing test (module must import without httpx/playwright)**

Create `python/scripts/test_set_decomposition.py`:

```python
"""Network-free unit tests for the IKEA set-decomposition scraper logic.

Run from python/scripts/:
    python -m pytest test_set_decomposition.py -v

These tests use only saved fixtures under tests/fixtures/ — no network, no
browser. They import ikea_model_scraper, which must therefore import cleanly
even when httpx / playwright are absent (see Task 1).
"""
import os
import importlib

import ikea_model_scraper as scraper

FIXTURES = os.path.join(os.path.dirname(__file__), "tests", "fixtures")


def _fixture(name):
    with open(os.path.join(FIXTURES, name), "r", encoding="utf-8") as f:
        return f.read()


def test_module_imports_without_heavy_deps():
    # Re-import to be explicit the module loads with no top-level httpx/playwright.
    importlib.reload(scraper)
    assert hasattr(scraper, "extract_article_number")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py::test_module_imports_without_heavy_deps -v`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'httpx'`
(raised while importing `ikea_model_scraper`).

- [ ] **Step 4: Make the imports lazy in `ikea_model_scraper.py`**

Replace the top imports (lines 7-8):

```python
import httpx
from playwright.async_api import async_playwright
```

with (drop both top-level imports):

```python
# httpx and playwright.async_api are imported lazily inside the functions that
# use them (harvest_product_urls / main) so the pure helper functions and the
# pytest suite can import this module without those packages installed.
```

In `harvest_product_urls` (line ~502), add the import as the first line of the
function body, before the `async with`:

```python
async def harvest_product_urls(sitemap_urls):
    import httpx
    product_urls = []
    namespace = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    async with httpx.AsyncClient(follow_redirects=True) as client:
```

In `main` (line ~883), add both imports as the first lines of the function body:

```python
async def main(limit, target_url):
    import httpx
    from playwright.async_api import async_playwright
    state = ScraperState(limit)
    is_test_mode = target_url is not None
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py::test_module_imports_without_heavy_deps -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py
git commit -m "refactor(scraper): lazy-import httpx/playwright so pure helpers are testable"
```

---

### Task 2: `is_set_product` — detect a set (category + type signals)

Either signal fires (intentionally eager; a <2-member result is demoted later).

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py` (add function after
  `parse_category_breadcrumbs`, ~line 109).
- Test: `python/scripts/test_set_decomposition.py`
- Create: `python/scripts/tests/fixtures/set_product.json`

- [ ] **Step 1: Create the set product JSON fixture**

Create `python/scripts/tests/fixtures/set_product.json` (trimmed real-shape
VIHALS combination feed — note: **no member articles**, that is the whole point):

```json
{
  "name": "VIHALS",
  "typeName": "table and 2 folding chairs",
  "validDesignText": "gateleg table white/red",
  "styleGroup": "Scandinavian",
  "globalId": "s69599421",
  "catalogRefs": {
    "products": {
      "elements": [
        {
          "id": "55555",
          "name": "Dining sets up to 2 seats",
          "parents": {
            "p1": { "id": "10", "name": "Tables, chairs & dining furniture" },
            "p2": { "id": "20", "name": "Dining sets" }
          }
        }
      ]
    },
    "series": { "elements": [ { "name": "VIHALS series" } ] }
  }
}
```

- [ ] **Step 2: Write failing tests**

Append to `test_set_decomposition.py`:

```python
import json


def _set_json():
    return json.loads(_fixture("set_product.json"))


def test_is_set_product_category_signal():
    pj = _set_json()
    crumbs = scraper.parse_category_breadcrumbs(pj)  # includes "Dining sets"
    assert scraper.is_set_product(pj, crumbs) is True


def test_is_set_product_type_signal_only():
    # No "set" in the category, but type_name names multiple chairs.
    pj = {"typeName": "table and 2 folding chairs"}
    assert scraper.is_set_product(pj, ["Tables, chairs & dining furniture"]) is True


def test_is_set_product_type_signal_bare_count():
    pj = {"typeName": "2 folding chairs"}
    assert scraper.is_set_product(pj, []) is True


def test_is_set_product_negative_plain_bed():
    pj = {"typeName": "bed frame, high"}
    crumbs = ["Beds & mattresses", "Bed frames", "Single bed frames"]
    assert scraper.is_set_product(pj, crumbs) is False


def test_is_set_product_negative_single_chair():
    # A single chair is not a set: no "and chairs", no leading count.
    pj = {"typeName": "folding chair"}
    assert scraper.is_set_product(pj, ["Chairs", "Tables, chairs & dining furniture"]) is False
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k is_set_product -v`
Expected: FAIL — `AttributeError: module 'ikea_model_scraper' has no attribute 'is_set_product'`.

- [ ] **Step 4: Implement `is_set_product`**

Add after `parse_category_breadcrumbs` (~line 109):

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k is_set_product -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py python/scripts/tests/fixtures/set_product.json
git commit -m "feat(scraper): is_set_product detection (category + type signals)"
```

---

### Task 3: `extract_included_articles` — parse "What's included" HTML

Dotted numbers (`705.957.33`) → 8-digit articles; exclude the set's own number;
preserve page order; capture per-item name + optional count + member URL.

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py` (add function near the other
  HTML helpers, after `glb_from_ld_json`, ~line 411).
- Test: `python/scripts/test_set_decomposition.py`
- Create: `python/scripts/tests/fixtures/whats_included.html`

- [ ] **Step 1: Create the "What's included" HTML fixture**

Create `python/scripts/tests/fixtures/whats_included.html` (representative
markup: a `pipf-list-view-item__wrapper` per member with a dotted article, a
name, an explicit "2 ×" count on the chair, and a member anchor; plus the set's
own number elsewhere to prove it is excluded):

```html
<!doctype html>
<html><body>
  <section class="pipf-product-information">
    <h2>What's included</h2>
    <div class="pipf-list-view-item__wrapper">
      <a href="/sg/en/p/vihals-gateleg-table-white-70595733/">
        <span class="pipf-list-view-item__name">VIHALS gateleg table, white</span>
        <span class="pipf-list-view-item__article">705.957.33</span>
      </a>
    </div>
    <div class="pipf-list-view-item__wrapper">
      <a href="/sg/en/p/vihals-folding-chair-white-40592745/">
        <span class="pipf-list-view-item__name">VIHALS folding chair, white</span>
        <span class="pipf-list-view-item__quantity">2 &times;</span>
        <span class="pipf-list-view-item__article">405.927.45</span>
      </a>
    </div>
  </section>
  <!-- the set's own article appears elsewhere on the page and must be excluded -->
  <div class="pipf-product-identifier__value">695.994.21</div>
</body></html>
```

- [ ] **Step 2: Write failing tests**

Append to `test_set_decomposition.py`:

```python
def test_extract_included_articles_basic():
    html = _fixture("whats_included.html")
    members = scraper.extract_included_articles(html, set_article="s69599421")
    arts = [m["article_number"] for m in members]
    assert arts == ["70595733", "40592745"]  # page order preserved


def test_extract_included_excludes_set_own_number():
    # 695.994.21 -> 69599421 is the set's own article and must not be a member.
    html = _fixture("whats_included.html")
    members = scraper.extract_included_articles(html, set_article="s69599421")
    assert "69599421" not in [m["article_number"] for m in members]


def test_extract_included_captures_name_count_url():
    html = _fixture("whats_included.html")
    members = scraper.extract_included_articles(html, set_article="s69599421")
    table, chair = members
    assert table["name"] == "VIHALS gateleg table, white"
    assert table["included_count"] is None        # no explicit count
    assert chair["included_count"] == 2           # "2 ×" parsed
    assert chair["url"].endswith("-40592745/")    # absolute member URL


def test_extract_included_empty_when_section_absent():
    assert scraper.extract_included_articles("<html><body></body></html>",
                                             set_article="s69599421") == []
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k extract_included -v`
Expected: FAIL — `AttributeError: ... has no attribute 'extract_included_articles'`.

- [ ] **Step 4: Implement `extract_included_articles`**

Parsing is regex-based over the raw HTML (consistent with the file's existing
`glb_from_ld_json` / `re.findall` HTML handling — no new BeautifulSoup
dependency). Add after `glb_from_ld_json` (~line 411):

```python
# A "What's included" list item wraps a member product. We slice the HTML into
# per-wrapper chunks and, inside each, read the dotted article (705.957.33), an
# optional name, an optional quantity ("2 ×" / "Qty 2"), and an optional member
# anchor. Dotted -> 8-digit article by stripping the dots.
_WRAPPER_SPLIT_RE = re.compile(r'pipf-list-view-item__wrapper')
_DOTTED_ART_RE = re.compile(r'\b(\d{3}\.\d{3}\.\d{2})\b')
_INCLUDED_NAME_RE = re.compile(
    r'pipf-list-view-item__name[^>]*>\s*(.*?)\s*<', re.I | re.DOTALL)
_INCLUDED_QTY_RE = re.compile(
    r'(?:qty\s*|x\s*)?(\d+)\s*(?:&times;|×|x)\b', re.I)
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k extract_included -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py python/scripts/tests/fixtures/whats_included.html
git commit -m "feat(scraper): extract member articles from What's included section"
```

---

### Task 4: `quantity_for_role` — resolve member quantity

Priority: explicit included-list count → leading integer before the role word
in `type_name` → default 1.

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py` (add after
  `extract_included_articles`).
- Test: `python/scripts/test_set_decomposition.py`

- [ ] **Step 1: Write failing tests**

Append to `test_set_decomposition.py`:

```python
def test_quantity_explicit_included_count_wins():
    # Even if type_name says 4, an explicit list count of 2 wins.
    assert scraper.quantity_for_role("chair", "table and 4 chairs", included_count=2) == 2


def test_quantity_from_type_name():
    assert scraper.quantity_for_role("chair", "table and 2 folding chairs", None) == 2


def test_quantity_role_word_without_count_defaults_one():
    # "...and chair" (singular, no number) -> 1.
    assert scraper.quantity_for_role("chair", "table and chair", None) == 1


def test_quantity_table_default_one():
    # The table role has no count in "table and 2 folding chairs" -> 1.
    assert scraper.quantity_for_role("table", "table and 2 folding chairs", None) == 1


def test_quantity_default_when_nothing_matches():
    assert scraper.quantity_for_role("other", None, None) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k quantity -v`
Expected: FAIL — `AttributeError: ... has no attribute 'quantity_for_role'`.

- [ ] **Step 3: Implement `quantity_for_role`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k quantity -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py
git commit -m "feat(scraper): quantity_for_role (included count -> type_name -> default 1)"
```

---

### Task 5: `classify_member_role` — table | chair | bench | stool | other

Derived from a member's functional `design.category` (from `categorize.py`)
plus its `type_name`. Drives the app arranger.

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py` (add after `quantity_for_role`).
- Test: `python/scripts/test_set_decomposition.py`

- [ ] **Step 1: Write failing tests**

Append to `test_set_decomposition.py`:

```python
def test_role_table_from_type_name():
    assert scraper.classify_member_role("tables", "gateleg table") == "table"


def test_role_chair_from_type_name():
    assert scraper.classify_member_role("seating", "folding chair") == "chair"


def test_role_bench():
    assert scraper.classify_member_role("seating", "bench") == "bench"


def test_role_stool():
    assert scraper.classify_member_role("seating", "bar stool") == "stool"


def test_role_chair_from_seating_category_fallback():
    # type_name unhelpful, but functional category is seating -> chair.
    assert scraper.classify_member_role("seating", None) == "chair"


def test_role_table_from_tables_category_fallback():
    assert scraper.classify_member_role("tables", None) == "table"


def test_role_other_when_unknown():
    assert scraper.classify_member_role("storage", "sideboard") == "other"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k role -v`
Expected: FAIL — `AttributeError: ... has no attribute 'classify_member_role'`.

- [ ] **Step 3: Implement `classify_member_role`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k role -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py
git commit -m "feat(scraper): classify_member_role (type_name + category)"
```

---

### Task 6: `build_set_recipe` + `write_set_recipe` — the recipe schema

Assemble the `sets/<set_key>.json` object exactly as the spec defines, and
write it under the output root. Pure assembly (`build_set_recipe`) is unit
tested; the writer (`write_set_recipe`) is tested against a temp dir.

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py` (add after
  `classify_member_role`).
- Test: `python/scripts/test_set_decomposition.py`

- [ ] **Step 1: Write failing tests**

Append to `test_set_decomposition.py`:

```python
def _resolved_members():
    # Shape produced by the orchestrator (Task 8) after scraping each member.
    return [
        {"group_key": "vihals-gateleg-table", "role": "table", "qty": 1,
         "article_number": "70595733"},
        {"group_key": "vihals-folding-chair", "role": "chair", "qty": 2,
         "article_number": "40592745"},
    ]


def test_build_set_recipe_schema():
    recipe = scraper.build_set_recipe(
        set_key="vihals-vihals-table-and-2-folding-chairs",
        set_name="VIHALS / VIHALS table and 2 folding chairs",
        set_article="s69599421",
        series="VIHALS series",
        style_group="Scandinavian",
        design_text="gateleg table white/red",
        member_source="included",
        members=_resolved_members(),
    )
    assert recipe == {
        "set_key": "vihals-vihals-table-and-2-folding-chairs",
        "set_name": "VIHALS / VIHALS table and 2 folding chairs",
        "set_article": "s69599421",
        "series": "VIHALS series",
        "style_group": "Scandinavian",
        "design_text": "gateleg table white/red",
        "member_source": "included",
        "members": [
            {"group_key": "vihals-gateleg-table", "role": "table", "qty": 1,
             "article_number": "70595733"},
            {"group_key": "vihals-folding-chair", "role": "chair", "qty": 2,
             "article_number": "40592745"},
        ],
    }


def test_write_set_recipe_creates_file(tmp_path):
    recipe = {"set_key": "demo-set", "members": []}
    path = scraper.write_set_recipe(str(tmp_path), recipe)
    assert path == os.path.join(str(tmp_path), "sets", "demo-set.json")
    assert os.path.exists(path)
    with open(path, encoding="utf-8") as f:
        assert json.load(f)["set_key"] == "demo-set"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k "set_recipe" -v`
Expected: FAIL — `AttributeError: ... has no attribute 'build_set_recipe'`.

- [ ] **Step 3: Implement `build_set_recipe` + `write_set_recipe`**

```python
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
```

Note: `write_set_recipe` is `async` (uses the module's `groups_lock`). The test
calls it via `asyncio.run`; update the test from Step 1 accordingly:

```python
import asyncio

def test_write_set_recipe_creates_file(tmp_path):
    recipe = {"set_key": "demo-set", "members": []}
    path = asyncio.run(scraper.write_set_recipe(str(tmp_path), recipe))
    assert path == os.path.join(str(tmp_path), "sets", "demo-set.json")
    assert os.path.exists(path)
    with open(path, encoding="utf-8") as f:
        assert json.load(f)["set_key"] == "demo-set"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k "set_recipe" -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py
git commit -m "feat(scraper): build + write sets/<set_key>.json recipe"
```

---

### Task 7: `discover_set_members` — hybrid discovery (page-first, series fallback)

Primary: "What's included" (Task 3). Fallback: series match — kept **minimal /
stubbed but tested** (returns `[]` with a logged note), per the spec's
"lower priority" guidance. Returns the union de-duped in page order plus the
chosen `member_source`.

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py` (add after `write_set_recipe`).
- Test: `python/scripts/test_set_decomposition.py`

`discover_set_members` is `async` and takes a Playwright `page`, but the testable
core (parse HTML, choose source) is delegated to a sync helper so tests need no
browser. Implement both.

- [ ] **Step 1: Write failing tests**

Append to `test_set_decomposition.py`:

```python
def test_discover_members_from_included_html():
    html = _fixture("whats_included.html")
    members, source = scraper.discover_set_members_from_html(html, "s69599421")
    assert source == "included"
    assert [m["article_number"] for m in members] == ["70595733", "40592745"]


def test_discover_members_series_fallback_stub():
    # No "What's included" section -> falls back to series (stubbed -> []),
    # but still reports the source it tried.
    members, source = scraper.discover_set_members_from_html(
        "<html><body></body></html>", "s69599421", series="VIHALS series")
    assert members == []
    assert source == "series"


def test_discover_members_no_section_no_series():
    members, source = scraper.discover_set_members_from_html(
        "<html><body></body></html>", "s69599421", series=None)
    assert members == []
    assert source == "included"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k discover -v`
Expected: FAIL — `AttributeError: ... has no attribute 'discover_set_members_from_html'`.

- [ ] **Step 3: Implement the sync core + the async wrapper**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k discover -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py
git commit -m "feat(scraper): discover_set_members (included primary + series fallback stub)"
```

---

### Task 8: Set branch in `process_product_page` — member scrape + demotion

When `is_set_product` fires, discover members, scrape each via the existing
single-product path (reusing the visited set), resolve role/qty/group_key,
and either write the recipe (>=2 members) or **demote** (<2 members) by scraping
the combined product normally (so its GLB is downloaded).

**Files:**
- Modify: `python/scripts/ikea_model_scraper.py`
  - `process_product_page` signature + body (~line 642): thread a `visited` set
    and `output_root`; add the set branch after the product JSON is fetched
    (~after line 685).
  - `queue_worker` (~line 873) and `main` (~line 914): create and pass a shared
    `visited` set.
- Test: `python/scripts/test_set_decomposition.py` (demotion decision is unit
  tested via a small pure helper; the full async flow is exercised by the real
  crawl, not in pytest).

This task has the most moving parts; split into small steps. First add a pure
**demotion-decision** helper (testable), then wire the async branch.

- [ ] **Step 1: Write failing test for the demotion decision helper**

Append to `test_set_decomposition.py`:

```python
def test_should_demote_when_fewer_than_two_members():
    assert scraper.should_demote_set([{"article_number": "70595733"}]) is True
    assert scraper.should_demote_set([]) is True


def test_should_not_demote_with_two_members():
    members = [{"article_number": "70595733"}, {"article_number": "40592745"}]
    assert scraper.should_demote_set(members) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k demote -v`
Expected: FAIL — `AttributeError: ... has no attribute 'should_demote_set'`.

- [ ] **Step 3: Implement `should_demote_set`**

Add after `discover_set_members`:

```python
def should_demote_set(members):
    """
    A "set" with fewer than 2 resolved members is demoted to a normal product
    (Part 1 §1.5): no recipe is written and the combined GLB IS downloaded
    (it's the only model we have). Returns True to demote.
    """
    return len(members) < 2
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -k demote -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit the helper**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py
git commit -m "feat(scraper): should_demote_set decision helper"
```

- [ ] **Step 6: Thread a shared `visited` set + `output_root` through the crawl**

Members are scraped by recursively calling `process_product_page` on each member
URL, reusing the visited set so a member already scraped standalone is not
re-downloaded (Part 1 §1.3). Change three signatures.

`process_product_page` (line ~642):

```python
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
```

`queue_worker` (line ~873):

```python
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
```

`main` (line ~914) — create one shared visited set and pass it to every worker:

```python
        async with httpx.AsyncClient(follow_redirects=True) as http_client:
            num_workers = 1 if is_test_mode else CONCURRENT_PAGES
            visited = set()
            workers = [
                asyncio.create_task(queue_worker(url_queue, context, http_client,
                                                 state, is_test_mode, visited))
                for _ in range(num_workers)
            ]
            await asyncio.gather(*workers)
```

- [ ] **Step 7: Add the set branch in `process_product_page`**

Insert immediately after `category_breadcrumbs` is resolved (after the DOM
fallback block, ~line 685, before "3. PRODUCT SUMMARY DESCRIPTION"). The branch
scrapes members first, builds the recipe, and **returns early without
downloading the set's own GLB** — unless demoted, in which case it falls through
to the normal product path below.

```python
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
                await write_set_recipe(OUTPUT_DIR, recipe)
                if not is_test_mode:
                    await log_processed_url(url)
                await page.close()
                return
```

Note on `json_fields`: it is computed at line ~672 (`extract_product_json_fields`)
which is *above* this insertion point, so `json_fields` and `item_id` are in
scope. `design_classification`, `extract_size`, `variant_group_key`,
`fetch_product_json`, `extract_product_json_fields`, `parse_category_breadcrumbs`
are all already imported/defined in this module.

- [ ] **Step 8: Verify the full pure-logic suite still passes**

Run: `cd python/scripts && python -m pytest test_set_decomposition.py -v`
Expected: PASS (all tests from Tasks 1-8).

- [ ] **Step 9: Smoke-check the module still parses (no syntax/scope errors)**

Run: `cd python/scripts && python -c "import ast; ast.parse(open('ikea_model_scraper.py').read()); print('parse ok')"`
Expected: `parse ok`.

(A live end-to-end run requires `httpx` + `playwright` + a browser and network,
which are unavailable in the test env; the real crawl is validated separately
with `python ikea_model_scraper.py -n 1 -u <VIHALS set URL>` when those deps and
network are present.)

- [ ] **Step 10: Commit**

```bash
git add python/scripts/ikea_model_scraper.py python/scripts/test_set_decomposition.py
git commit -m "feat(scraper): set branch in process_product_page (member scrape + recipe + demotion)"
```

---

## Self-Review

**1. Spec coverage (Part 1 only — §1.1–§1.6):**

| Spec item | Task |
| --- | --- |
| §1.1 set detection — category signal (`/\bsets?\b/i`) | Task 2 |
| §1.1 set detection — type signal (`and chairs` / `N chairs`) | Task 2 |
| §1.1 eager detection self-corrects via demotion | Task 2 (doc) + Task 8 |
| §1.2 A — "What's included" dotted articles, exclude set's own | Task 3 |
| §1.2 — page-order, de-dup | Task 3 / Task 7 |
| §1.2 B — series fallback (minimal, flagged) | Task 7 (stub + `member_source="series"`) |
| §1.2 — member URL from anchor else bare `-<art>/` slug | Task 3 (anchor) + Task 8 (slug build) |
| §1.3 — scrape each member via existing single-product path | Task 8 (recursive `process_product_page`) |
| §1.3 — visited reuse, shared limit | Task 8 (Step 6 visited threading) |
| §1.3 — set's fused GLB NOT downloaded | Task 8 (early `return`) |
| §1.4 — qty: included count → type_name → default 1 | Task 4 |
| §1.5 — recipe schema `sets/<set_key>.json` (exact keys) | Task 6 |
| §1.5 — members referenced by group_key, not duplicated | Task 6 + Task 8 |
| §1.5 — role table/chair/bench/stool/other | Task 5 |
| §1.5 — <2-member demotion (download combined GLB, log) | Task 8 |
| §1.5 — series recipes logged lower-confidence | Task 7 (print) |
| §1.6 — pytest, no network, fixtures | All tasks; fixtures in Tasks 2 & 3 |
| §1.6 — `is_set_product` positives + negatives incl. MALM bed | Task 2 (`test_is_set_product_negative_plain_bed`) |
| §1.6 — dotted extraction, set excluded | Task 3 |
| §1.6 — quantity parse ("…2 chairs"→2; "…and chair"→1) | Task 4 |
| §1.6 — role classification | Task 5 |
| §1.6 — demotion when <2 | Task 8 |

All Part 1 spec items map to a concrete task. (Parts 2.x are explicitly out of
scope for this plan.)

**2. Placeholder scan:** No "TBD / implement later / handle edge cases / add
appropriate X" steps. Every code step shows real code; every run step shows the
command + expected PASS/FAIL. The one `TODO(part1-followup)` is inside the
*deliberately stubbed* series fallback (§1.2 B is "lower confidence" /
lower-priority per spec) — it is tested (`test_discover_members_series_fallback_stub`)
and its stub behaviour (return `[]`, flag `member_source="series"`, log) is fully
specified, so it is a complete, shippable stub rather than a plan placeholder.

**3. Type/name consistency:**
- `is_set_product(product_json, category_hierarchy)` — same signature in Task 2
  def and Task 8 call. ✔
- `extract_included_articles(html, set_article)` returns dicts with keys
  `article_number` / `name` / `included_count` / `url` — consumed unchanged in
  Tasks 4, 7, 8. ✔ (`included_count`, not `count`, used consistently.)
- `quantity_for_role(role, type_name, included_count)` — Task 4 def matches Task
  8 call `quantity_for_role(role, json_fields.get("type_name"), mem.get("included_count"))`. ✔
- `classify_member_role(design_category, type_name)` — Task 5 def matches Task 8
  call with `member_design.get("category")`. ✔ (`design_classification` returns a
  `category` key — verified against `categorize.py`.)
- `build_set_recipe(...)` keyword args in Task 6 def match Task 8 call exactly
  (`set_key, set_name, set_article, series, style_group, design_text,
  member_source, members`). ✔
- `write_set_recipe(output_root, recipe)` is `async` in Task 6; Task 6 test uses
  `asyncio.run`; Task 8 calls `await write_set_recipe(OUTPUT_DIR, recipe)`. ✔
- `discover_set_members(page, product_json, set_article)` async + sync core
  `discover_set_members_from_html(html, set_article, series=None)` returning
  `(members, source)` — consistent across Tasks 7 and 8. ✔
- `should_demote_set(members)` — Task 8 Step 3 def matches Step 7 call. ✔
- `variant_group_key(product_name, type_name, size, product_title=None)` — Task 8
  calls match the existing signature (verified in scraper line 525). ✔
- `process_product_page` gains `visited`/`depth` params (Task 8 Step 6) and the
  recursive member call passes `depth=depth+1`; the set branch is guarded by
  `depth == 0` so members are never re-treated as sets. ✔

Fixes applied inline during review: `write_set_recipe` made `async` (it touches
the shared `groups_lock`), and the Task 6 test updated to `asyncio.run` to match.
`process_product_page` got a `depth` guard so a member that itself trips
`is_set_product` is not recursively decomposed.

---

## Execution Handoff

**Plan complete and saved to
`docs/superpowers/plans/2026-05-31-ikea-set-decomposition-1-scraper.md`. Two
execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task,
review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans,
batch execution with checkpoints.

**Which approach?**

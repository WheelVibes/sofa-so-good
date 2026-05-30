"""Network-free unit tests for the IKEA set-decomposition scraper logic.

Run from python/scripts/:
    python3.11 -m pytest test_set_decomposition.py -v

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


# ---------------------------------------------------------------------------
# Task 2: is_set_product
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Task 3: extract_included_articles
# ---------------------------------------------------------------------------

def test_extract_included_articles_basic():
    html = _fixture("whats_included.html")
    members = scraper.extract_included_articles(html, set_article="s69599421")
    arts = [m["article_number"] for m in members]
    assert arts == ["70595733", "40592745"]  # page order preserved


def test_extract_included_excludes_set_own_number():
    html = _fixture("whats_included.html")
    members = scraper.extract_included_articles(html, set_article="s69599421")
    assert "69599421" not in [m["article_number"] for m in members]


def test_extract_included_captures_name_count_url():
    html = _fixture("whats_included.html")
    members = scraper.extract_included_articles(html, set_article="s69599421")
    table, chair = members
    assert table["name"] == "VIHALS gateleg table, white"
    assert table["included_count"] is None
    assert chair["included_count"] == 2
    assert chair["url"].endswith("-40592745/")


def test_extract_included_empty_when_section_absent():
    assert scraper.extract_included_articles("<html><body></body></html>",
                                             set_article="s69599421") == []


# ---------------------------------------------------------------------------
# Task 4: quantity_for_role
# ---------------------------------------------------------------------------

def test_quantity_explicit_included_count_wins():
    assert scraper.quantity_for_role("chair", "table and 4 chairs", included_count=2) == 2


def test_quantity_from_type_name():
    assert scraper.quantity_for_role("chair", "table and 2 folding chairs", None) == 2


def test_quantity_role_word_without_count_defaults_one():
    assert scraper.quantity_for_role("chair", "table and chair", None) == 1


def test_quantity_table_default_one():
    assert scraper.quantity_for_role("table", "table and 2 folding chairs", None) == 1


def test_quantity_default_when_nothing_matches():
    assert scraper.quantity_for_role("other", None, None) == 1


# ---------------------------------------------------------------------------
# Task 5: classify_member_role
# ---------------------------------------------------------------------------

def test_role_table_from_type_name():
    assert scraper.classify_member_role("tables", "gateleg table") == "table"


def test_role_chair_from_type_name():
    assert scraper.classify_member_role("seating", "folding chair") == "chair"


def test_role_bench():
    assert scraper.classify_member_role("seating", "bench") == "bench"


def test_role_stool():
    assert scraper.classify_member_role("seating", "bar stool") == "stool"


def test_role_chair_from_seating_category_fallback():
    assert scraper.classify_member_role("seating", None) == "chair"


def test_role_table_from_tables_category_fallback():
    assert scraper.classify_member_role("tables", None) == "table"


def test_role_other_when_unknown():
    assert scraper.classify_member_role("storage", "sideboard") == "other"

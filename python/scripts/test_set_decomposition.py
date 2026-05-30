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

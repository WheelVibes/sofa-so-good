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

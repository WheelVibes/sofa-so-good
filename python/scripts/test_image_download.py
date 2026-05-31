import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from ikea_model_scraper import image_filename


def test_strips_query_params_for_original():
    # IKEA serves a resized asset when ?f=/width params are present; we strip
    # them so the saved file is the original master.
    url = "https://www.ikea.com/images/malm-bed.jpg?f=s&w=300"
    assert image_filename(url, "black-brown-main") == "black-brown-main.jpg"


def test_derives_extension_from_path():
    url = "https://www.ikea.com/images/sofa.png"
    assert image_filename(url, "white-main") == "white-main.png"


def test_defaults_to_jpg_when_no_extension():
    url = "https://www.ikea.com/images/asset?id=123"
    assert image_filename(url, "grey-context") == "grey-context.jpg"


def test_sanitises_unsafe_stem_chars():
    url = "https://x/a.jpg"
    assert image_filename(url, "black/brown:main") == "blackbrownmain.jpg"

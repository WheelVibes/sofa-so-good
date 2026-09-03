"""Tests for the negative-vector argv fix. No bpy, no Blender — plain python3.

    python3 python/scripts/blender/test_cli_argv.py

`cli_argv` is deliberately bpy-free so this can run in a normal interpreter; the
four entry points that use it all import bpy transitively and cannot be imported
here, so the parser shapes below are rebuilt rather than borrowed. The last test
guards that: it reads the four scripts as TEXT and asserts each one routes its
argv through `normalise`, which is the property that actually prevents the bug.
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cli_argv


def _parser():
    p = argparse.ArgumentParser(prog="t")
    p.add_argument("--scene", required=True)
    p.add_argument("--sun-dir", default=None)
    p.add_argument("--cam-pos", default=None)
    p.add_argument("--fov", type=float, default=50.0)
    p.add_argument("--sky", action="store_true")
    p.add_argument("--json", action="store_true")
    return p


def test_the_exact_command_that_failed():
    # Verbatim from the repro that motivated this: it exited 2 before the fix.
    argv = ["--scene", "/tmp/s.glb", "--sky", "--sun-dir", "-0.50585,-24.83117,2.77232"]
    a = _parser().parse_args(cli_argv.normalise(_parser(), argv))
    assert a.sun_dir == "-0.50585,-24.83117,2.77232"
    assert a.sky is True


def test_the_equals_form_still_works():
    # The documented workaround must not regress -- callers already use it.
    argv = ["--scene", "s", "--sun-dir=-0.5,1,2"]
    a = _parser().parse_args(cli_argv.normalise(_parser(), argv))
    assert a.sun_dir == "-0.5,1,2"


def test_positive_vectors_are_untouched():
    argv = ["--scene", "s", "--cam-pos", "7.3,1.6,3.4"]
    assert cli_argv.normalise(_parser(), argv) == argv


def test_a_bare_negative_scalar():
    a = _parser().parse_args(cli_argv.normalise(_parser(), ["--scene", "s", "--fov", "-30"]))
    assert a.fov == -30.0


def test_a_following_FLAG_is_not_swallowed():
    # The safety property: --sun-dir --json must still be an error, not
    # sun_dir="--json". A value must contain a digit to be re-attached.
    argv = ["--scene", "s", "--sun-dir", "--json"]
    assert cli_argv.normalise(_parser(), argv) == argv


def test_store_true_flags_never_absorb_a_value():
    # --sky takes nothing, so a negative number after it is a positional error,
    # not something to glue on.
    argv = ["--scene", "s", "--sky", "-1"]
    assert cli_argv.normalise(_parser(), argv) == argv


def test_a_purely_numeric_value_is_rewritten_LOSSLESSLY():
    # Not just legal -- argparse must receive the identical string.
    a = _parser().parse_args(cli_argv.normalise(_parser(), ["--scene", "-1"]))
    assert a.scene == "-1"


def test_the_LIMIT_of_the_rule_a_dash_leading_PATH_is_left_alone():
    # Honest boundary, asserted rather than assumed: the regex requires the whole
    # token to be numeric, so `--scene -1.glb` is NOT rewritten and still needs the
    # `=` form. Widening it to any token would mean swallowing real flags, which is
    # the worse failure -- a silently wrong value beats no render only if you enjoy
    # debugging. Coordinates, the flags that actually go negative, are all numeric.
    argv = ["--scene", "-1.glb"]
    assert cli_argv.normalise(_parser(), argv) == argv
    a = _parser().parse_args(cli_argv.normalise(_parser(), ["--scene=-1.glb"]))
    assert a.scene == "-1.glb"


def test_trailing_flag_with_no_value_does_not_index_past_the_end():
    argv = ["--scene", "s", "--sun-dir"]
    assert cli_argv.normalise(_parser(), argv) == argv


def test_normalise_is_idempotent():
    p = _parser()
    once = cli_argv.normalise(p, ["--scene", "s", "--sun-dir", "-0.5,1,2"])
    assert cli_argv.normalise(p, once) == once


def test_ALL_FOUR_entry_points_route_argv_through_normalise():
    # The load-bearing test. cli_argv could be perfect and unused; these four are
    # every script a caller invokes with coordinates.
    here = os.path.dirname(os.path.abspath(__file__))
    for name in ("render_still.py", "render_from_manifest.py",
                 "render_visibility.py", "bake_material.py"):
        src = open(os.path.join(here, name), encoding="utf-8").read()
        assert "cli_argv.normalise(p, argv)" in src, f"{name} bypasses the fix"
        assert re.search(r"^import cli_argv", src, re.M), f"{name} missing the import"


if __name__ == "__main__":
    fns = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for name, fn in fns:
        fn()
        print(f"  ok  {name}")
    print(f"{len(fns)} passed")

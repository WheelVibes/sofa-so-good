"""Make `--flag -0.5,…` work, so a negative vector cannot cost a 35-minute render.

**Why this exists.** argparse treats any token beginning with `-` as an option, so
`--sun-dir -0.5,-24.8,2.8` fails with *"expected one argument"* and `--cam-pos
-3,1.6,0.4` fails the same way. Both flags take world coordinates, and coordinates
are negative half the time — this is the normal case, not an edge case.

**Documentation was already tried and it did not hold.** The trap is written up in
`docs/skills/blender.md` twice, and it still fired again afterwards (a hand-built
repro of a five-view reference set, which then had to be re-issued). The lesson is
the one `src/changelogVersions.test.ts` records for version collisions: when the
same mistake recurs through care, the missing thing is a mechanism, not more
discipline. So the fix lives in the parser rather than in prose.

**Why this is unambiguous.** A token is only rewritten when it *looks numeric* —
digits with optional sign, dot, comma, exponent. No option string in any of these
scripts can match that (they all start with a letter after the dashes), so nothing
that could be a flag is ever swallowed as a value. `--sun-dir --json` still errors
exactly as before; `--sun-dir=-0.5,…` and `--sun-dir 0.5,…` are untouched because
they already work.

The result is that the `=` form remains correct and is no longer *required*, which
is the point: callers may now pass whichever form is natural, including a list argv
built programmatically, and the leading-`-` trap is gone rather than documented.
"""

from __future__ import annotations

import argparse
import re

#: A value we are willing to re-attach to its flag: a NEGATIVE number or vector of
#: them (only a leading `-` confuses argparse). Deliberately narrow — it requires a
#: digit, so it cannot match an option string like `--json` or `-h`.
_NEGATIVE_NUMERIC = re.compile(r"^-[0-9.,eE+-]*[0-9][0-9.,eE+-]*$")


def _single_value_options(parser: argparse.ArgumentParser) -> set[str]:
    """Option strings that consume exactly one following token.

    Derived from the parser rather than hardcoded, so a numeric flag added later is
    covered without anyone remembering this file exists.
    """
    # nargs 0 (store_true, --help) and nargs "*"/"+" are excluded: only an option
    # that wants exactly one token can have that token stolen by the `-` rule.
    out: set[str] = set()
    for action in parser._actions:  # noqa: SLF001 — argparse exposes no public API
        if action.option_strings and action.nargs in (None, 1):
            out.update(action.option_strings)
    return out


def normalise(parser: argparse.ArgumentParser, argv: list[str]) -> list[str]:
    """Rewrite `['--sun-dir', '-0.5,1,2']` to `['--sun-dir=-0.5,1,2']`.

    Everything else is passed through unchanged, including `--` and positionals.
    """
    takes_value = _single_value_options(parser)
    out: list[str] = []
    i = 0
    while i < len(argv):
        tok = argv[i]
        nxt = argv[i + 1] if i + 1 < len(argv) else None
        if tok in takes_value and nxt is not None and _NEGATIVE_NUMERIC.match(nxt):
            out.append(f"{tok}={nxt}")
            i += 2
            continue
        out.append(tok)
        i += 1
    return out

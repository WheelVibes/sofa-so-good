# Skills

Living how-to documents for tooling that is **easy to get wrong from memory** — where the
cost of re-deriving the same experiments each session is higher than the cost of writing
down what was measured.

## Why here and not `.claude/skills/`

`.gitignore:48` ignores `.claude/`, so anything placed there is **local-only and never
committed**. A skill that only exists on one machine cannot accumulate lessons across
sessions, which is the entire point. Skills therefore live in `docs/` with the rest of the
tracked reference material, and are linked from `CLAUDE.md` — whose reference list is
loaded every turn, so a session finds the skill before it starts guessing.

If `.claude/` ever becomes tracked, these can move without changing their contents.

## The rules that make a skill worth having

1. **Record what was *measured*, not what is *believed*.** State the version/build the
   facts were verified against. A fact without a build attached is a guess with a
   timestamp.
2. **Append in the same session as the work**, not as a follow-up. A lesson deferred is a
   lesson lost, and the next session pays for it twice — once re-deriving, once being
   misled.
3. **Lead with the gotchas.** The valuable content is the things that fail silently or
   contradict the obvious reading, not the happy path.
4. **Prune and consolidate.** A skill should read as *more specific* after each use, not
   merely longer. Delete superseded entries rather than stacking them; if a figure is
   withdrawn, say so and why, because a number that vanishes invites the same mistake.
5. **Real examples from this repo**, with real paths and real outputs — not invented
   snippets. An example that has never been run is a hypothesis.

## Index

| skill | covers |
| --- | --- |
| [`blender.md`](blender.md) | Headless Blender/Cycles — photoreal stills, asset QA, material R&D. Verified against the installed build. |

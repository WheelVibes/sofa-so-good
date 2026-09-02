# Adding features

Recipes mirror the `CLAUDE.md` "Adding content" rules. Run the visual-verification
pass (see [Testing & verification](./testing-and-verification.md)) after any app
change.

## Add a furniture primitive

1. Create `furniture/primitives/<Name>.tsx` — a function taking `{ props }`,
   floor-anchored, centred, facing +Z, built at real metres.
2. Register it in `primitives/index.ts` + the `PrimitiveKind` union.
3. Add a `ParametricDef` to `furniture/builtinCatalog.ts`; set
   `verticalSpan`/`mounted`/`noClip` for non-floor items.
4. To emit light, add to `lightEmitters.ts`; if it animates every frame (a fan),
   call `useAnimatedSource()` so the demand loop stays alive.
5. To ship it in the default flat, add to `furniture/defaults/` (every entry is
   collision-checked by `defaultLayout.test.ts`).

## Add a finish

Add an entry to `materials/builtinCatalog.ts` (`procedural` with a pattern, or
`solid`); new patterns go in `procedural/generators.ts`. Pass a real `Material`
instance to `material=` props (use `furnitureMaterials.ts` helpers).

## Add a category

Add to the `FurnitureCategory` union + `FURNITURE_CATEGORIES`, then satisfy every
exhaustive `Record<FurnitureCategory,…>` the type-checker flags
(`furniturePrices.ts`, `BudgetPanel.tsx`, `report.ts`, `UploadModelDialog.tsx`,
catalog grouping) plus `ui/catalog/CategoryTabs.tsx` + `CategoryIcon.tsx`.

## Add a bundled GLB

Drop `<name>.glb` (+ optional `<name>.glb.json` sidecar) into
`public/assets/furniture/` (must be floor-anchored + centred — bake sizing in),
then `npm run index-assets`. Licence may be CC0 or CC-BY (attribution shown).

## Add a downloadable source

Furniture/material via API/CORS → a Poly-Pizza-style client reusing
`buildEntry`/`commit`, or a new `RemoteProvider` in `PROVIDERS` (+
`PROD_PROVIDER_IDS` if CORS-capable). Otherwise a `manual` registry entry. See
[Packs & remote catalog](./packs-and-remote-catalog.md).

## Keep docs current

After any change that adds/removes/reshapes a system, update `CLAUDE.md` **and**
`README.md` in the same change, and the relevant user-guide page under
`docs/user/`. Keep `TODO.md` current when deferring work.

## Scripted source edits: use `scripts/apply-edit.mjs`

A scripted `str.replace` that matches nothing returns the original string without complaint. Every
downstream step still succeeds, and the result looks explicable — which is why this has gone wrong
four times in this repo (see the script's header for the four, with version numbers).

`scripts/apply-edit.mjs` refuses to write unless every edit matches its expected occurrence count,
and verifies all of them before writing any, so a mismatch leaves the file untouched rather than
half-applied:

```sh
echo '{"file":"src/x.ts","edits":[{"old":"a","new":"b","count":1}]}' | node scripts/apply-edit.mjs
```

Two things it will not do, both deliberate: it will not write when the result equals the input, and
it will not apply a partial batch. `--dry` reports without writing.

**Why a tool and not a rule.** The rule ("assert the edit landed") was written down after the first
occurrence and ignored three more times. A prohibition lives in whoever remembers it; a tool that
exits non-zero does not need remembering. The same reasoning is why the render/specification
override registers in `lightEmitters.ts` are separated by a test rather than by a comment.

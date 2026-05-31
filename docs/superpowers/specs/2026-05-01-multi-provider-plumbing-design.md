# Multi-Provider Furniture Plumbing — Design

**Date:** 2026-05-01
**Status:** Approved
**Scope:** Foundation for adding new CC0 furniture providers (Sketchfab, Quaternius, Kenney, ambientCG-models, …) without per-provider edits to type and resolver code.

## Motivation

The runtime CC0 catalog currently supports furniture only from Poly Haven. Two pieces of code hardcode that assumption and would silently mis-attribute or fail for any other provider:

1. [src/furniture/types.ts:141](src/furniture/types.ts#L141) — `RemoteGltfDef.provider: 'polyhaven'` (literal, not a union).
2. [src/catalog/remote/resolver.ts:93](src/catalog/remote/resolver.ts#L93) — `bundleToFurnitureDef` returns `provider: 'polyhaven'` regardless of `entry.provider`.

These are latent bugs that block the rest of the multi-provider work. This spec lays the foundation only — no new providers ship here.

## Out of scope

- Adding any new `ProviderId` value (those land with their respective subsystem specs: Quaternius/Kenney, Sketchfab, procedural).
- Surfacing ambientCG furniture in the UI (rejected option B — see brainstorm).
- Refactoring UI components that hardcode `'polyhaven'` for status/labels. They degrade gracefully for unknown providers; subsystem 2 will extend them when it adds a real new provider.
- Save-format migration — widening a literal to a union is backwards-compatible; existing saves with `provider: 'polyhaven'` continue to type-check.

## Design

### 1. Widen `RemoteGltfDef.provider` to `ProviderId`

[src/furniture/types.ts](src/furniture/types.ts):

```diff
-import type { FurnitureCategory } from '../furniture/types';
+import type { ProviderId } from '../catalog/remote/types';
 …
 export interface RemoteGltfDef extends FurnitureDefBase {
   …
-  provider: 'polyhaven';
+  provider: ProviderId;
   …
 }
```

`ProviderId` is the canonical provider union (currently `'polyhaven' | 'ambientcg'`). Future subsystems extend it by adding to that union; `RemoteGltfDef.provider` widens automatically.

**Decision (default, flag to override):** single `ProviderId` for both furniture and material providers. The runtime registry already knows which kind a provider returns; the type system doesn't need to enforce a separate `FurnitureProviderId`/`MaterialProviderId` split.

### 2. Stop hardcoding `'polyhaven'` in the resolver

[src/catalog/remote/resolver.ts:93](src/catalog/remote/resolver.ts#L93):

```diff
   return {
     id: `${entry.provider}:${entry.slug}:${resolution}`,
     …
-    provider: 'polyhaven',
+    provider: entry.provider,
     slug: entry.slug,
     …
   };
```

After step 1 widens the type, this assignment type-checks for any `ProviderId`.

### 3. Test

Add to [src/catalog/remote/resolver.test.ts](src/catalog/remote/resolver.test.ts) a unit test that constructs a `RemoteEntry` with `provider: 'ambientcg'` and asserts the resolved `RemoteGltfDef.provider === 'ambientcg'`. This locks the fix and catches future regressions where someone re-hardcodes the provider.

## Risk

Low. The change is mechanical and confined to two files plus one test. No behavioural change for the existing Poly Haven path; new providers added later land on a working foundation.

## What this unlocks

Subsystems 2-4 (per the brainstorm) each add one entry to the `ProviderId` union and register a `RemoteProvider` implementation. The resolver, type system, and runtime catalog handle the new provider without further per-provider edits.

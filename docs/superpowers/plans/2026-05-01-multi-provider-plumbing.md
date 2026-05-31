# Multi-Provider Furniture Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop hardcoding `'polyhaven'` in furniture-def types and the resolver so future CC0 furniture providers can be added without per-provider edits.

**Architecture:** Two trivial code changes (one type widening, one literal → variable in the resolver) plus one regression test. No behavioural change for existing Poly Haven users.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md](docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md)

---

## File Structure

- Modify: [src/furniture/types.ts:138-152](src/furniture/types.ts#L138-L152) — widen `RemoteGltfDef.provider` literal to `ProviderId`.
- Modify: [src/catalog/remote/resolver.ts:49-102](src/catalog/remote/resolver.ts#L49-L102) — replace hardcoded `'polyhaven'` with `entry.provider` in `bundleToFurnitureDef`.
- Modify: [src/catalog/remote/resolver.test.ts](src/catalog/remote/resolver.test.ts) — add a regression test for the non-polyhaven furniture path.

No new files.

---

### Task 1: Regression test for the resolver hardcoding bug

**Files:**
- Test: [src/catalog/remote/resolver.test.ts](src/catalog/remote/resolver.test.ts)

- [ ] **Step 1: Add the failing test**

Append inside the existing `describe('resolver', …)` block in `src/catalog/remote/resolver.test.ts`:

```typescript
  it('preserves the provider on furniture defs (does not hardcode polyhaven)', () => {
    const acgFurnEntry: RemoteEntry = {
      provider: 'ambientcg',
      slug: 'wooden-chair',
      kind: 'furniture',
      name: 'Wooden Chair',
      category: 'seating',
      thumbUrl: '',
      resolutions: ['2k'],
      attribution: 'ambientCG',
      sourceUrl: 'https://ambientcg.com/view?id=wooden-chair',
    };
    const bundle: AssetBundle = {
      kind: 'furniture',
      gltfJson: { buffers: [{ uri: 'scene.bin', byteLength: 1 }], images: [] },
      bin: new Blob(['b']),
      textures: {},
      rootPath: 'asset.gltf',
    };
    const def = bundleToFurnitureDef(acgFurnEntry, '2k', bundle);
    expect(def.provider).toBe('ambientcg');
    expect(def.id).toBe('ambientcg:wooden-chair:2k');
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/catalog/remote/resolver.test.ts`

Expected: the new test FAILS with `expected 'polyhaven' to be 'ambientcg'`. The pre-existing two tests still pass.

(The id assertion happens to already pass because the `id` is templated from `entry.provider`. The `provider` field is the one that's hardcoded.)

- [ ] **Step 3: Commit**

```bash
git add src/catalog/remote/resolver.test.ts
git commit -m "test: regression test for hardcoded provider in resolver"
```

---

### Task 2: Widen `RemoteGltfDef.provider` to `ProviderId`

**Files:**
- Modify: [src/furniture/types.ts](src/furniture/types.ts)

- [ ] **Step 1: Add the import and widen the literal**

In `src/furniture/types.ts`, at the top of the file (after the existing imports — currently the file has no imports, so add a fresh import line below the file's leading comment block, before `export type FurnitureCategory`):

```typescript
import type { ProviderId } from '../catalog/remote/types';
```

Then locate the `RemoteGltfDef` interface (around line 138) and change:

```typescript
  provider: 'polyhaven';
```

to:

```typescript
  provider: ProviderId;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS. The widening is a strict superset, so all existing `provider: 'polyhaven'` literals continue to satisfy the new union.

If tsc reports a circular-import error between `furniture/types.ts` and `catalog/remote/types.ts`, verify: `catalog/remote/types.ts` already imports `FurnitureCategory` from `furniture/types.ts`. Importing only the `ProviderId` type back the other way is allowed under `import type` (erased at runtime, no circular runtime evaluation). If tsc still complains, move `ProviderId` and `Resolution` into a new leaf file `src/catalog/remote/providerId.ts` and import it from both sides — but only do this if tsc actually fails.

- [ ] **Step 3: Run the test (still failing on the resolver hardcoding)**

Run: `npx vitest run src/catalog/remote/resolver.test.ts`

Expected: the new regression test still FAILS (resolver hasn't been fixed yet); the two pre-existing tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add src/furniture/types.ts
git commit -m "types: widen RemoteGltfDef.provider to ProviderId"
```

---

### Task 3: Stop hardcoding `'polyhaven'` in `bundleToFurnitureDef`

**Files:**
- Modify: [src/catalog/remote/resolver.ts:93](src/catalog/remote/resolver.ts#L93)

- [ ] **Step 1: Replace the hardcoded literal**

In `src/catalog/remote/resolver.ts`, inside the return statement at the end of `bundleToFurnitureDef` (around line 86-101), change:

```typescript
    provider: 'polyhaven',
```

to:

```typescript
    provider: entry.provider,
```

- [ ] **Step 2: Run the resolver tests**

Run: `npx vitest run src/catalog/remote/resolver.test.ts`

Expected: all three tests PASS — including the new regression test from Task 1.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`

Expected: PASS. No other test pinned the resolver's provider field to a literal.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/remote/resolver.ts
git commit -m "fix: use entry.provider in bundleToFurnitureDef instead of hardcoding polyhaven"
```

---

### Task 4: Update TODO.md to mark subsystem 1 complete

**Files:**
- Modify: [TODO.md](TODO.md)

- [ ] **Step 1: Mark subsystem 1 done**

In `TODO.md`, under "Furniture Catalog Expansion", replace the subsystem 1 line:

```
- **Subsystem 1: Multi-provider plumbing** — fix hardcoded `'polyhaven'` in [resolver.ts:93](src/catalog/remote/resolver.ts#L93) and widen `RemoteGltfDef.provider` to `ProviderId` so subsystems 2-4 don't require per-provider type edits. Spec: [docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md](docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md). Plan pending.
```

with:

```
- ~~**Subsystem 1: Multi-provider plumbing**~~ — done. Spec: [docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md](docs/superpowers/specs/2026-05-01-multi-provider-plumbing-design.md). Plan: [docs/superpowers/plans/2026-05-01-multi-provider-plumbing.md](docs/superpowers/plans/2026-05-01-multi-provider-plumbing.md).
```

- [ ] **Step 2: Commit**

```bash
git add TODO.md docs/superpowers/plans/2026-05-01-multi-provider-plumbing.md
git commit -m "docs: mark multi-provider plumbing subsystem complete"
```

---

## Self-Review

- **Spec coverage:** All three numbered design items in the spec (widen type, fix resolver, add test) map to Tasks 2, 3, 1 respectively. Task 4 is plan hygiene per the auto-memory rule.
- **Placeholder scan:** No TBDs, no "handle edge cases", no untyped code blocks. All file paths exact. All commands exact with expected output.
- **Type consistency:** `ProviderId` is referenced consistently. `entry.provider` matches the field name on `RemoteEntry` ([catalog/remote/types.ts:11](src/catalog/remote/types.ts#L11)). Test assertions use field names (`def.provider`, `def.id`) that exist on `RemoteGltfDef`.
- **Order:** Task 1 first establishes a failing test, Task 2 widens the type so the resolver fix in Task 3 is type-correct, Task 3 makes the test pass. Test-first throughout.

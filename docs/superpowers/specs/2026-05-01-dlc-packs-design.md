# DLC Packs — Design

**Date:** 2026-05-01
**Status:** Approved
**Scope:** Subsystem 2 of the furniture-catalog expansion. Adds an opt-in "downloadable content" system for CC0 furniture packs, shipping with the Kenney **Furniture Kit** pack as the v1 content (140 GLB items, ~5 MB). Introduces a generic in-app notification system as supporting infrastructure. Quaternius is deferred: its packs are hosted on Google Drive and distributed as FBX/OBJ/Blend rather than GLB, both of which break browser-direct fetching — see the deferred-TODO at the end.

## Motivation

Poly Haven and ambientCG ship per-asset REST APIs that suit the existing runtime-fetch-on-click model. Kenney doesn't — its asset packs distribute as a single zip per pack containing many GLBs. The right user experience is **explicit, opt-in installation** of a whole pack at once: user clicks Install, accepts the size cost, gets all items at once, browses them instantly thereafter from a local cache.

This is meaningfully different from the existing runtime catalog (per-asset, fetched on click, ephemeral blob URLs). It needs its own state, IDB stores, and UI surface.

## v1 content: Kenney Furniture Kit

- **Source:** [kenney.nl/assets/furniture-kit](https://kenney.nl/assets/furniture-kit) (CC0).
- **Direct zip URL:** `https://kenney.nl/media/pages/assets/furniture-kit/e56d2a9828-1677580847/kenney_furniture-kit.zip` (HEAD verified — 200, content-length 5,130,729 bytes ≈ 5.1 MB).
- **Contents:** 140 GLB files under `Models/GLTF format/<name>.glb`, plus duplicate FBX and OBJ copies (ignored). Naming is consistent (`bedDouble`, `kitchenStove`, `loungeSofaCorner`, `bathroomSink`, `tableCoffee`, `lampRoundFloor`, `bookcaseClosed`, …).
- **Filter:** wall, floor, door, stairs, ceilingFan, paneling entries are architectural — they're filtered out at parse time. The remaining ~125 are real furniture.
- **Category mapping** (substring rules, applied in priority order — first match wins):
  | substring contains | category |
  |---|---|
  | `bed` (and not `kitchen`) | beds |
  | `chair`, `sofa`, `lounge`, `bench`, `stool`, `pillow` | seating |
  | `desk`, `table` | tables |
  | `bookcase`, `cabinet`, `coatRack`, `cardboardBox` | storage |
  | `kitchen` | kitchen |
  | `lamp` | lighting |
  | (everything else: bathroom, plants, electronics, decor) | decor |
  | `wall`, `floor`, `door`, `stairs`, `ceilingFan`, `paneling` | (filtered out) |
- **Display name**: convert camelCase `loungeSofaCorner` → `Lounge Sofa Corner` via a regex split-and-titlecase.

## Architecture

### Three layers, built bottom-up

1. **Notification system (generic).** Zustand slice + container component. Used first by the pack install flow; future flows (renders, exports, long-running work) reuse it.
2. **Pack runtime.** Pack registry, install/uninstall flow, IDB stores, catalog merging.
3. **UI surface.** "Packs" subtab in the catalog drawer.

### A. Notification system

**State:**
```ts
interface Notification {
  id: string;
  kind: 'info' | 'progress' | 'success' | 'error';
  title: string;
  message?: string;
  /** 0..1, only for kind: 'progress' */
  progress?: number;
  dismissable: boolean;
  /** Auto-dismiss timeout in ms; default 3000 for success/info, never for progress/error */
  autoDismissMs?: number;
  createdAt: number;
}
```

**Slice API** (`src/state/slices/notificationsSlice.ts`):
```ts
notify.start({ title, kind?, message? }): string  // returns id
notify.update(id, partial: Partial<Notification>): void
notify.success(id, message?): void                // mutates kind→'success', schedules auto-dismiss
notify.error(id, message: string): void           // mutates kind→'error', dismissable
notify.dismiss(id): void
```

**Component** (`src/ui/notifications/NotificationContainer.tsx`):
- Fixed bottom-right stack, max 5 visible (oldest above).
- Each notification: icon by kind, title, optional message line, progress bar for `progress` kind.
- Auto-dismiss timer for success/info per `autoDismissMs`.
- X button when `dismissable`.

### B. Pack runtime

**Types** (`src/catalog/packs/types.ts`):
```ts
export interface Pack {
  id: string;                   // 'quaternius-ultimate-interiors'
  name: string;
  description: string;
  attribution: string;
  license: 'CC0';
  sourceUrl: string;            // landing page URL
  /** Direct .zip URL the install flow fetches via the proxy. */
  downloadUrl: string;
  /** Approximate zip size in bytes — surfaced in the install button label. */
  sizeBytes: number;
  /** Pure function: given the unzipped file map, returns the entries to register.
   *  Lives on the Pack so each pack can map filenames → categories its own way. */
  parseEntries(files: Record<string, Uint8Array>): PackEntryDescriptor[];
}

export interface PackEntryDescriptor {
  id: string;                   // local-to-pack, e.g. 'sofa-01'
  name: string;
  category: FurnitureCategory;
  /** Path in the unzipped file map, used by the install flow to read bytes. */
  glbPath: string;
}

export interface InstalledPackEntry {
  id: string;                   // `${packId}:${entryId}`
  packId: string;
  entryId: string;
  name: string;
  category: FurnitureCategory;
  footprint: { w: number; d: number; h: number };  // derived from bbox at install
  /** IDB key for the GLB blob. */
  glbKey: string;
  /** IDB key for the thumbnail JPEG blob. */
  thumbKey: string;
}

export interface InstalledPack {
  packId: string;
  installedAt: string;          // ISO date
  entries: InstalledPackEntry[];
}
```

**Registry** (`src/catalog/packs/registry.ts`):
```ts
export const AVAILABLE_PACKS: Pack[] = [
  {
    id: 'kenney-furniture-kit',
    name: 'Kenney Furniture Kit',
    description: 'Stylized low-poly furniture — bedrooms, kitchens, bathrooms, lounges, decor (~125 items).',
    attribution: 'Kenney — kenney.nl (CC0)',
    license: 'CC0',
    sourceUrl: 'https://kenney.nl/assets/furniture-kit',
    downloadUrl: '/kenney/media/pages/assets/furniture-kit/e56d2a9828-1677580847/kenney_furniture-kit.zip',
    sizeBytes: 5_130_729,
    parseEntries: parseKenneyFurnitureKit,
  },
];
```

`parseKenneyFurnitureKit` walks the unzipped file map, takes only entries under `Models/GLTF format/*.glb`, applies the filter+category-mapping rules from the v1-content section above, and produces `PackEntryDescriptor`s with camelCase-to-Title-Case display names. Lives in the same file as the registry.

**IDB stores** (`src/catalog/packs/db.ts`, mirrors the user-uploads pattern in [src/state/uploads/](src/state/uploads/)):
- `pack-blobs` (object store): keyed by `glbKey` and `thumbKey` strings, value is `Blob`. One store for both kinds — keys are namespaced by suffix (`:glb`, `:thumb`).
- `installed-packs` (object store): keyed by `packId`, value is `InstalledPack`.

**Install flow** (`src/catalog/packs/install.ts`):

```
installPack(pack: Pack, signal?: AbortSignal): Promise<InstalledPack>
```

1. Open notification: `notify.start({ kind: 'progress', title: 'Installing ${pack.name}', progress: 0 })`.
2. Fetch zip with streaming reader. Read `Content-Length`, accumulate chunks, update progress 0 → 0.5.
3. Concatenate chunks → `unzipSync` from fflate. Update progress 0.5 → 0.6.
4. Call `pack.parseEntries(files)` → list of `PackEntryDescriptor`.
5. For each descriptor:
   - Read GLB bytes from `files[descriptor.glbPath]`.
   - Render thumbnail via `renderThumbnail(glbBytes)` (next section). Returns `Blob`.
   - Compute bbox-derived footprint via `glbFootprint(glbBytes)` (uses Three.js GLTFLoader + bbox; same approach the runtime catalog already uses for some entries).
   - Write `<packId>:<entryId>:glb` and `<packId>:<entryId>:thumb` blobs to `pack-blobs`.
   - Push `InstalledPackEntry` into the in-memory accumulator.
   - Update progress 0.6 + 0.4 × (i / N).
6. Write the assembled `InstalledPack` to `installed-packs`.
7. Dispatch a packs-slice action `markInstalled(installedPack)`.
8. `notify.success(id, '${N} items added to your catalog')`.

Cancellation: if `signal.aborted` at any step, throw — caller catches and `notify.error(id, 'Install cancelled')`.

**Thumbnail generation** (`src/catalog/packs/thumbnail.ts`):
- One reusable offscreen `WebGLRenderer({ alpha: true })` of size 256×256, created lazily on first call, cached for the install session.
- For each GLB: parse with `GLTFLoader.parse(buffer, '', resolve, reject)`, set up minimal scene (HemisphereLight + DirectionalLight), frame the camera to the model's bbox with a fixed 3/4 angle, render once, `renderer.domElement.toBlob('image/jpeg', 0.85)` → Blob.
- The renderer is `dispose()`d when the install completes.
- Failure for a single GLB doesn't fail the install — falls back to a 1×1 transparent placeholder blob and logs a warning.

### C. Catalog merging

**State** (`src/state/slices/installedPacksSlice.ts`):
```ts
interface InstalledPacksState {
  packs: Record<string, InstalledPack>;  // keyed by packId
  installing: Record<string, { progress: number; notificationId: string }>;
}
```

**New def variant** in [src/furniture/types.ts](src/furniture/types.ts):
```ts
export interface PackGltfDef extends FurnitureDefBase {
  kind: 'gltf';
  source: 'pack';
  packId: string;
  entryId: string;
  /** Object URL hydrated from the IDB blob at app start. */
  runtimeUrl?: string;
  thumbUrl?: string;
  license: 'CC0';
  attribution: string;
  sourceUrl: string;
}

export type GltfDef = BuiltinGltfDef | UserGltfDef | RemoteGltfDef | PackGltfDef;
```

**Catalog selector** (`src/state/selectors/mergedCatalog.ts`):
```ts
mergedFurnitureCatalog(state) =
  [...builtinFurniture, ...userUploads, ...flattenInstalledPacks(state.installedPacks)]
```

`flattenInstalledPacks` walks every installed pack's entries and synthesises a `PackGltfDef` per entry (resolving IDB blob → object URL on first read, memoised by `<packId>:<entryId>`).

**Hydration**: on app boot, `installedPacksSlice.hydrate()` reads all installed-pack manifests from IDB and resolves all blob URLs (same pattern user uploads already use).

### D. UI surface

**New tab** in `<CatalogDrawer>`: "Packs" alongside Browse/Upload (whatever the existing tabs are — see [src/ui/catalog/CatalogDrawer.tsx](src/ui/catalog/CatalogDrawer.tsx)).

**Tab content** (`src/ui/catalog/PacksTab.tsx`):
- Header: "Downloadable Content".
- For each `Pack` in `AVAILABLE_PACKS`:
  - Card with: name, attribution, description, size (`50 MB`), source link.
  - Status button:
    - Not installed → `[Install (50 MB)]` → calls `installPack(pack)`.
    - Installing → `[Installing… 32%]` (bound to `installing[packId].progress`), button disabled, optional Cancel button.
    - Installed → `[Installed — Uninstall]`.
- Notes: pack entries flow into the existing browse tab's furniture filter automatically once installed; no separate browse view per pack.

**Install button label** uses `humanizeBytes(pack.sizeBytes)`.

**Uninstall flow** (`src/catalog/packs/uninstall.ts`): delete every entry's blobs from `pack-blobs`, delete the pack record from `installed-packs`, dispatch `markUninstalled(packId)`. Notification: brief success toast.

### E. CORS / proxy

[vite.config.ts](vite.config.ts) gains:
```ts
'/kenney': {
  target: 'https://kenney.nl',
  changeOrigin: true,
  rewrite: (p) => p.replace(/^\/kenney/, ''),
},
```

(Kenney's CDN does not advertise CORS headers on the zip endpoint — verified via `curl -sI`.)

Production needs an equivalent reverse-proxy entry alongside the existing ambientCG one. **Adds to the existing TODO** "Runtime catalog: production CORS proxy" — does not block this subsystem from shipping in dev.

## Data flow summary

```
[User clicks Install]
    │
    ▼
installPack(pack)
    │
    ├── fetch /kenney/.../kenney_furniture-kit.zip (streaming)
    │       │ progress 0 → 0.5  ──→ notify.update
    │       ▼
    ├── unzipSync                ──→ progress 0.5 → 0.6
    │       │
    │       ▼
    ├── parseEntries(files)      → 150× PackEntryDescriptor
    │       │
    │       ▼
    │   for each entry (~125):
    │     ├── renderThumbnail    → Blob (256×256 jpeg)
    │     ├── glbFootprint       → {w,d,h} (bbox-derived)
    │     ├── IDB.put pack-blobs (glb + thumb)
    │     └── progress += 0.4/N
    │
    ├── IDB.put installed-packs[packId] = InstalledPack
    ├── installedPacksSlice.markInstalled
    └── notify.success
    │
    ▼
[Catalog selector re-derives — pack entries appear in browse]
[Click an entry → render via existing GLTF loader against the IDB blob URL]
```

## Out of scope

- Mirroring/hosting packs ourselves (per user direction; we proxy at runtime).
- Auto-update when a pack re-releases.
- Granular per-asset selection inside a pack (it's all-or-nothing).
- Subsystems 3 (Sketchfab) and 4 (procedural).
- Migrating user-uploads IDB to share `pack-blobs` (separate concern).
- Pack thumbnails for the *Pack card itself* (we use a category icon or static asset; only per-entry thumbnails are in scope).
- **Quaternius packs.** Their packs are hosted on Google Drive folders (no programmatic single-zip download from the browser) and ship as FBX/OBJ/Blend rather than GLB. Either path requires substantial extra infra (proxied folder-zip API + FBXLoader integration, OR maintainer-mirroring + format conversion). Tracked as a deferred TODO; revisit after subsystems 3 and 4 ship.

## Risks

- **Kenney URL drift.** The download URL contains a content-hash directory (`e56d2a9828-1677580847/`). When Kenney updates the pack, the hash changes and the old URL likely 404s. Mitigation: verify HEAD `content-length` matches `pack.sizeBytes` ± 5% before consuming the body; if not, fail with a clear notification.error pointing the user at the source page so they can report the broken pack URL. Pack registry version-bumps fix it once we know.
- **Thumbnail render performance.** 150× GLB parse + render on a single thread can take 10-30s. Mitigation: progress UI surfaces this honestly; the install runs to completion in the background and the user can keep working in another tab.
- **IDB quota.** ~50 MB of GLBs + ~1 MB of thumbs is well within typical browser quotas, but failure mode (`QuotaExceededError`) needs a clear notification.error message.
- **Tab close mid-install.** No transactional safety. Mitigation: install logic detects partial state on next boot (manifest absent but blobs present) and offers a "clean up partial install" action — deferred to a follow-up TODO if it doesn't bite us in v1.

## What this unlocks

- Adding more Kenney packs (Kenney has dozens — Music Kit, Conference Kit, City Kit interior bits): one new entry in `AVAILABLE_PACKS` per pack, each with its own `parseEntries`. No infra changes.
- Generic notification system available for any other long-running flow (subsystem 3's Sketchfab fetches, subsystem 4's procedural rebuilds, future export operations).
- Quaternius support, once Google-Drive-folder-zip proxying or FBX-loading is added.

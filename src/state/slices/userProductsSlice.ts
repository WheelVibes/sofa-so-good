import { evictSlotScene } from '../../furniture/configurator/gltfSlot'
import type { ConfigurableProduct } from '../../furniture/configurator/model'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/**
 * User-authored **configurable products** (Asset Studio Stage 3d). The GLB
 * designer's "Make configurable" flow exports a built piece as a
 * {@link ConfigurableProduct} (base + variant slots, each option a baked
 * `data:`-URL GLB); those products are registered here so they appear alongside
 * the authored `CONFIGURABLE_PRODUCTS` wherever configurable products are browsed
 * (the `ConfiguratorDialog`) and are resolvable when a placed configured item is
 * re-opened for editing (SLOT-204).
 *
 * Persisted to localStorage (`hdb_user_products`) — the per-device authored-
 * library pattern shared with `userSetsSlice`/`clipboardSlice`: load once at
 * module init, write on every mutation, kept OUT of the design save schema +
 * autosave watch-list (a product is an authoring artifact, not part of a saved
 * room design; the products it bakes into the catalog persist through the normal
 * user-furniture path). The embedded GLBs are self-contained `data:` URLs, so no
 * IDB blob bookkeeping is needed.
 *
 * **Persistence is FAIL-LOUD (finding 4).** The embedded option/base GLBs are
 * large, so a write can blow the ~5 MB localStorage quota. `persistProducts`
 * reports success/failure; `addUserConfigurableProduct` propagates it so the
 * authoring dialog can toast an error and NOT falsely claim the product was
 * saved. (The heavier IDB-blob route — small metadata in localStorage, GLB
 * bytes in `IdbAssetStore` with async boot hydration — was scoped out of this
 * batch: it needs an object-URL lifecycle + a boot-hydration pipeline whose
 * blast radius outweighs its benefit here; the concrete defect, silent loss on
 * quota, is fully closed by failing loud.)
 */
export interface UserProductsSlice {
  userConfigurableProducts: ConfigurableProduct[]
  /** Register (or replace by id) an exported configurable product. Returns
   *  `false` when the localStorage write failed (quota/private mode) so the
   *  caller can surface the failure instead of claiming success. */
  addUserConfigurableProduct: (product: ConfigurableProduct) => boolean
  removeUserConfigurableProduct: (id: string) => void
  setUserConfigurableProducts: (products: ConfigurableProduct[]) => void
}

const LS_KEY = 'hdb_user_products'

/** Structural guard — enough to reject garbage; `clampConfig` is the real defence
 *  once a product is used. */
function isProduct(v: unknown): v is ConfigurableProduct {
  if (!v || typeof v !== 'object') return false
  const p = v as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.label === 'string' &&
    typeof p.category === 'string' &&
    !!p.base &&
    typeof p.base === 'object' &&
    Array.isArray(p.slots)
  )
}

function loadProducts(): ConfigurableProduct[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed.filter(isProduct) : []
  } catch {
    return []
  }
}

/** Write the product list to localStorage. Returns `false` on a failed write
 *  (quota — the embedded GLBs can be large — or private mode) so the caller can
 *  fail loud. A no-localStorage environment (SSR/tests) reports success (nothing
 *  to lose). */
function persistProducts(products: ConfigurableProduct[]): boolean {
  try {
    if (typeof localStorage === 'undefined') return true
    if (products.length > 0) localStorage.setItem(LS_KEY, JSON.stringify(products))
    else localStorage.removeItem(LS_KEY)
    return true
  } catch {
    return false
  }
}

/** Drop a product's slot-GLB parses from the configurator's scene cache when it
 *  is removed/replaced (finding 6). Product GLBs are `data:` urls (never cached),
 *  so this is a no-op today — wired for robustness if a product ever carries a
 *  bundled url. */
function evictProductScenes(product: ConfigurableProduct): void {
  if (product.base.gltfUrl) evictSlotScene(product.base.gltfUrl)
  for (const slot of product.slots) {
    for (const opt of slot.options) if (opt.gltfUrl) evictSlotScene(opt.gltfUrl)
  }
}

export const USER_PRODUCTS_INITIAL: Pick<UserProductsSlice, 'userConfigurableProducts'> = {
  userConfigurableProducts: loadProducts(),
}

export const createUserProductsSlice: SliceCreator<UserProductsSlice, RootState> = (set, get) => ({
  ...USER_PRODUCTS_INITIAL,
  addUserConfigurableProduct: (product) => {
    if (!isProduct(product)) return false
    // Re-export with the same id REPLACES (finding 5) — evict the stale one's
    // slot-scene parses so a cached template can't linger (finding 6).
    const prior = get().userConfigurableProducts.find((p) => p.id === product.id)
    if (prior) evictProductScenes(prior)
    const next = [...get().userConfigurableProducts.filter((p) => p.id !== product.id), product]
    const ok = persistProducts(next)
    // Only commit to state when the write succeeded, so the in-memory registry
    // never claims a product the reload won't have (fail-loud, finding 4).
    if (ok) set({ userConfigurableProducts: next })
    return ok
  },
  removeUserConfigurableProduct: (id) => {
    const prior = get().userConfigurableProducts.find((p) => p.id === id)
    if (prior) evictProductScenes(prior)
    const next = get().userConfigurableProducts.filter((p) => p.id !== id)
    persistProducts(next)
    set({ userConfigurableProducts: next })
  },
  setUserConfigurableProducts: (products) => {
    const next = products.filter(isProduct)
    persistProducts(next)
    set({ userConfigurableProducts: next })
  },
})

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
 */
export interface UserProductsSlice {
  userConfigurableProducts: ConfigurableProduct[]
  /** Register (or replace by id) an exported configurable product. */
  addUserConfigurableProduct: (product: ConfigurableProduct) => void
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

function persistProducts(products: ConfigurableProduct[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (products.length > 0) localStorage.setItem(LS_KEY, JSON.stringify(products))
    else localStorage.removeItem(LS_KEY)
  } catch {
    // quota (the embedded GLBs can be large) / private mode — non-critical.
  }
}

export const USER_PRODUCTS_INITIAL: Pick<UserProductsSlice, 'userConfigurableProducts'> = {
  userConfigurableProducts: loadProducts(),
}

export const createUserProductsSlice: SliceCreator<UserProductsSlice, RootState> = (set, get) => ({
  ...USER_PRODUCTS_INITIAL,
  addUserConfigurableProduct: (product) => {
    if (!isProduct(product)) return
    const next = [...get().userConfigurableProducts.filter((p) => p.id !== product.id), product]
    persistProducts(next)
    set({ userConfigurableProducts: next })
  },
  removeUserConfigurableProduct: (id) => {
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

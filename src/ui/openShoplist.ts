import { isFeatureEnabled } from '../features/featureFlags'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'

/**
 * Open the shoppable buy-list (F20) in a new window. The window is opened
 * *synchronously* in the click handler (popup-blocker-safe), then the builder
 * module is dynamic-imported and the document written — so the export code stays
 * out of the main chunk. Mirrors `openDesignReport`/`openBoq`; shared by the
 * File menu, the mobile toolbar, and ⌘K so the logic lives in one place.
 *
 * Licensing rule: retailer product links (IKEA) are dev-gated behind the
 * dev-only `ikeaLive` flag — the generic, link-free export ships in prod.
 */
export function openShoppingList(): void {
  const s = useStore.getState()
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Shopping list blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the shopping list again.',
    })
    return
  }
  void import('./shoplist')
    .then(({ buildShopList, buildShopListHtml }) => {
      const list = buildShopList(s.floorPlan, s.items, buildMergedCatalog(s), {
        includeRetailerLinks: isFeatureEnabled('ikeaLive'),
      })
      win.document.write(
        buildShopListHtml({
          title: s.floorPlan.name || 'Design',
          note: s.designNote,
          budgetTarget: s.budgetTarget,
          generatedOn: new Date().toLocaleDateString('en-SG', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
          list,
        }),
      )
      win.document.close()
      win.focus()
    })
    .catch(() => win.close())
}

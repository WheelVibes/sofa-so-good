// Verifies the mobile catalog/inspector fixes (v0.14.2.1):
//  - catalog cards have NO per-card palette/stamp buttons
//  - favourite heart toggles to a solid red (filled) heart when saved
//  - inspector header shows a Duplicate icon between lock and delete
export default {
  name: 'mobile-catalog-inspector-fixes',
  description:
    'Mobile catalog cards drop the palette/stamp buttons; favourite heart fills red; inspector header gains a duplicate icon.',
  url: 'http://localhost:5173/',
  steps: [
    { name: 'store-ready', waitFor: { storeExists: true }, timeout: 60000 },
    {
      name: 'dismiss-overlays',
      eval: "try { localStorage.setItem('hdb_onboarded','1') } catch {}; const s = window.__store.getState(); s.endTour?.(); s.setOnboardingOpen?.(false); s.dismissLocationPrompt?.()",
    },
    { name: 'daytime', eval: 'window.__store.getState().setManualHour?.(13)' },
    { name: 'viewport-mobile', viewport: { width: 390, height: 844 } },
    { name: 'enter-room-editor', store: { action: 'enterRoomEditor', args: ['livingDining'] } },
    { name: 'room-active', waitFor: { store: 'state.roomEditor.active === true' }, timeout: 5000 },
    { name: 'wait-room-load', wait: 2000 },
    { name: 'open-catalog', store: { action: 'setCatalogOpen', args: [true] } },
    { name: 'catalog-visible', waitFor: { css: '.cat-card' }, timeout: 20000 },
    {
      name: 'assert-no-palette-or-stamp',
      eval: "(function(){ const bad = document.querySelectorAll('.cat-card .stamp-btn, .cat-card .variant-btn'); if (bad.length) throw new Error('found ' + bad.length + ' palette/stamp buttons still on cards'); const fav = document.querySelector('.cat-card .fav-btn'); if (!fav) throw new Error('favourite heart missing'); })()",
    },
    { name: 'shot-catalog-cards', screenshot: 'catalog-cards-no-palette-stamp' },
    {
      name: 'favourite-first-card',
      eval: "document.querySelector('.cat-card .fav-btn').click()",
    },
    { name: 'wait-fav', wait: 300 },
    {
      name: 'assert-heart-on',
      eval: "(function(){ const on = document.querySelector('.cat-card .fav-btn.on'); if (!on) throw new Error('heart did not switch to .on when favourited'); })()",
    },
    { name: 'shot-heart-filled', screenshot: 'favourite-heart-filled-red' },
    // Place an item and select it so the inspector opens with its header icon row.
    {
      name: 'place-item',
      eval: "(function(){ const st = window.__store.getState(); window.__lastId = st.addItem({ defId: (st.items[0] && st.items[0].defId) || 'sofa-3seat', position: [0,0], rotation: 0, props: {} }); })()",
    },
    { name: 'select-item', eval: 'window.__store.getState().selectItem(window.__lastId)' },
    { name: 'inspector-visible', waitFor: { css: '.inspector .insp-head-btns' }, timeout: 8000 },
    {
      name: 'assert-duplicate-icon',
      eval: "(function(){ const dup = document.querySelector('.inspector .insp-head-btns button[aria-label=\"Duplicate item\"]'); if (!dup) throw new Error('duplicate icon missing from inspector header'); })()",
    },
    { name: 'shot-inspector-header', screenshot: 'inspector-header-duplicate-icon' },
  ],
}

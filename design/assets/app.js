/* ============================================================
   HDB Sandbox — Prototype app logic
   Builds the toolbar, panels and HUD, wires interactions, and
   re-themes the scene. Pure vanilla JS for stability.
   ============================================================ */
(function () {
  const stage = document.getElementById('stage');
  const params = new URLSearchParams(location.search);
  const THEMES = ['clay', 'kampong', 'porcelain', 'estate'];
  const THEME_META = {
    clay: { name: 'Clay', accent: 'oklch(0.6 0.125 42)', chip: 'oklch(0.9 0.022 55)', desc: 'Warm paper & terracotta' },
    kampong: { name: 'Kampong', accent: 'oklch(0.55 0.1 152)', chip: 'oklch(0.9 0.028 110)', desc: 'Sand & tropical green' },
    porcelain: { name: 'Porcelain', accent: 'oklch(0.58 0.075 200)', chip: 'oklch(0.9 0.012 220)', desc: 'Cool porcelain & jade' },
    estate: { name: 'Estate', accent: 'oklch(0.64 0.12 62)', chip: 'oklch(0.87 0.012 80)', desc: 'HDB concrete & amber' },
  };
  const pTheme = params.get('theme');
  const pMode = params.get('mode');
  const embed = params.get('embed') === '1';
  const systemDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const forceMobile = params.get('mobile') === '1';
  const isMobile = () => forceMobile || (window.matchMedia && window.matchMedia('(max-width: 640px)').matches);

  // ---- state ----
  const S = {
    theme: THEMES.includes(pTheme) ? pTheme : 'clay',
    modePref: pMode === 'dark' ? 'dark' : pMode === 'light' ? 'light' : 'auto',
    get mode() { return this.modePref === 'auto' ? (systemDark() ? 'dark' : 'light') : this.modePref; },
    screen: 'sandbox', // 'sandbox' | 'plan' | 'walk'
    loading: !embed,
    appearanceOpen: false,
    tab: 'builtin', category: 'seating', page: 0, query: '',
    selSwatch: 1, locked: false, flipH: false,
    catalogOpen: true, inspectorOpen: true,
    planTool: 'select', walkRoom: 'Living / Dining',
    openMenu: null,
    panels: { budget: false, graphics: false, finishes: false, help: false, presets: false },
    // --- extended flows ---
    empty: false,
    editRoomName: 'Living / Dining',
    editSurface: 'back',
    sheen: 28,
    accentWall: 'back',
    finishes: {
      back: { type: 'paint', idx: 3 }, left: { type: 'paint', idx: 0 },
      right: { type: 'paint', idx: 0 }, floor: { type: 'vinyl', idx: 1 },
      ceiling: { type: 'paint', idx: 0 },
    },
    presetFilter: 'All', presetSel: null,
    onboard: false, onbStep: 0,
    mobileMenuOpen: false,
    // --- production feature layer ---
    leftMode: 'catalog',        // 'catalog' | 'layers'
    selectedId: 'sofa1',
    lyrCollapsed: {},
    shopTab: 'list',
    shareVis: 'link',
    compareVers: null,
    measure: false,             // smart-guides / clearance overlay
    guides: true,
    cmdk: false, cmdQuery: '', cmdIdx: 0,
    ctx: null,                  // {x,y} right-click menu
    rooms: ['Living / Dining', 'Master Bedroom', 'Bedroom 2', 'Kitchen'],
    collections: [],
    placed: [],                 // populated below
    issues: [],                 // populated below
    versions: [],               // populated below
  };
  // add new floating panels to the panel registry
  S.panels.clearance = false;
  S.panels.versions = false;
  S.panels.swap = false;
  S.panels.share = false;

  // ---- data ----
  const CATS = [
    ['seating', 'Seating', 'catSeating'],
    ['beds', 'Beds', 'catBed'],
    ['tables', 'Tables', 'catTable'],
    ['storage', 'Storage', 'catStorage'],
    ['kitchen', 'Kitchen', 'catKitchen'],
    ['bath', 'Bath', 'catBath'],
    ['lighting', 'Lighting', 'catLighting'],
    ['decor', 'Decor', 'catDecor'],
    ['plants', 'Plants', 'catPlant'],
    ['appliances', 'Appliances', 'catAppliance'],
    ['textiles', 'Textiles', 'catTextile'],
    ['electronics', 'Electronics', 'catElectronics'],
    ['kids', 'Kids', 'catKids'],
    ['outdoor', 'Outdoor', 'catOutdoor'],
  ];
  const ITEMS = {
    seating: [
      ['Halmstad 3-seater', 899, 'catSeating'], ['Klippan loveseat', 449, 'catSeating'],
      ['Poäng armchair', 179, 'catSeating'], ['Strandmon wing chair', 549, 'catSeating'],
      ['Ektorp sofa', 699, 'catSeating'], ['Söderhamn corner', 1290, 'catSeating'],
      ['Pello chair', 99, 'catSeating'], ['Nolmyra easy chair', 79, 'catSeating'],
    ],
    tables: [
      ['Lisabo coffee table', 149, 'catTable'], ['Lack side table', 19, 'catTable'],
      ['Ekedalen dining', 329, 'catTable'], ['Vejmon nest', 129, 'catTable'],
      ['Norden gateleg', 279, 'catTable'], ['Stockholm console', 399, 'catTable'],
    ],
    plants: [
      ['Fejka monstera', 39, 'catPlant'], ['Fejka snake plant', 19, 'catPlant'],
      ['Fejka palm', 49, 'catPlant'], ['Ceramic planter', 24, 'catPlant'],
    ],
  };
  function itemsFor(cat) {
    if (ITEMS[cat]) return ITEMS[cat];
    const ic = (CATS.find((c) => c[0] === cat) || [])[2] || 'catOther';
    const nm = (CATS.find((c) => c[0] === cat) || ['', 'Item'])[1];
    return Array.from({ length: 6 }, (_, i) => [`${nm} ${String.fromCharCode(65 + i)}`, 49 + i * 60, ic]);
  }

  const FINISHES = [
    ['Oak plank', 'oklch(0.78 0.045 75)'], ['Walnut plank', 'oklch(0.5 0.05 55)'],
    ['Teak plank', 'oklch(0.62 0.06 60)'], ['White porcelain', 'oklch(0.93 0.005 250)'],
    ['Charcoal tile', 'oklch(0.38 0.008 260)'], ['Carrara marble', 'oklch(0.9 0.008 250)'],
    ['Terrazzo', 'oklch(0.85 0.02 80)'], ['Warm concrete', 'oklch(0.74 0.008 80)'],
    ['Wool carpet', 'oklch(0.7 0.02 70)'],
  ];
  const SOFA_COLORS = ['oklch(0.82 0.012 250)', 'oklch(0.62 0.02 250)', 'oklch(0.7 0.04 150)', 'oklch(0.6 0.1 42)', 'oklch(0.5 0.05 55)', 'oklch(0.36 0.008 260)'];
  const BUDGET = [
    ['Seating', 1797, 'oklch(0.6 0.1 42)'], ['Tables', 627, 'oklch(0.62 0.06 150)'],
    ['Storage', 848, 'oklch(0.58 0.07 200)'], ['Lighting', 296, 'oklch(0.7 0.1 75)'],
    ['Decor & plants', 412, 'oklch(0.66 0.09 320)'],
  ];

  // ---- placed-furniture model: single source of truth -----------
  // Pre-populated default layout matching the floor plan. Layers,
  // shopping list, clearance and the inspector all read from this.
  const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c[0], c[1]]));
  S.placed = [
    { id: 'sofa1', name: 'Halmstad 3-seater', cat: 'seating', ic: 'catSeating', price: 899, room: 'Living / Dining', w: 218, d: 93, h: 78, x: 3.40, z: 8.10, rot: 180, swatch: 1, mat: 'Linen', sheen: 32 },
    { id: 'cof1', name: 'Lisabo coffee table', cat: 'tables', ic: 'catTable', price: 149, room: 'Living / Dining', w: 118, d: 50, h: 45, x: 3.30, z: 6.90, rot: 0, swatch: 4 },
    { id: 'tv1', name: 'Stockholm console', cat: 'storage', ic: 'catStorage', price: 399, room: 'Living / Dining', w: 160, d: 40, h: 50, x: 3.30, z: 5.40, rot: 0, swatch: 5 },
    { id: 'arm1', name: 'Poäng armchair', cat: 'seating', ic: 'catSeating', price: 179, room: 'Living / Dining', w: 68, d: 82, h: 100, x: 1.60, z: 7.60, rot: 120, swatch: 3, mat: 'Bouclé', sheen: 20 },
    { id: 'rug1', name: 'Stockholm wool rug', cat: 'textiles', ic: 'catTextile', price: 259, room: 'Living / Dining', w: 300, d: 200, h: 1, x: 3.30, z: 7.40, rot: 0, swatch: 0 },
    { id: 'din1', name: 'Ekedalen dining table', cat: 'tables', ic: 'catTable', price: 329, room: 'Living / Dining', w: 120, d: 80, h: 75, x: 5.20, z: 8.40, rot: 90, swatch: 0 },
    { id: 'chr1', name: 'Ekedalen chair', cat: 'seating', ic: 'catSeating', price: 89, room: 'Living / Dining', w: 45, d: 51, h: 85, x: 5.20, z: 7.30, rot: 0, swatch: 2 },
    { id: 'chr2', name: 'Ekedalen chair', cat: 'seating', ic: 'catSeating', price: 89, room: 'Living / Dining', w: 45, d: 51, h: 85, x: 5.20, z: 9.50, rot: 180, swatch: 2 },
    { id: 'plt1', name: 'Fejka monstera', cat: 'plants', ic: 'catPlant', price: 39, room: 'Living / Dining', w: 40, d: 40, h: 120, x: 0.90, z: 5.20, rot: 0, swatch: 2 },
    { id: 'bed1', name: 'Malm bed frame', cat: 'beds', ic: 'catBed', price: 329, room: 'Master Bedroom', w: 160, d: 200, h: 38, x: 9.20, z: 2.40, rot: 0, swatch: 5 },
    { id: 'wrd1', name: 'Pax wardrobe', cat: 'storage', ic: 'catStorage', price: 560, room: 'Master Bedroom', w: 200, d: 60, h: 236, x: 7.60, z: 0.60, rot: 0, swatch: 3, locked: true },
    { id: 'lmp1', name: 'Forsa table lamp', cat: 'lighting', ic: 'catLighting', price: 45, room: 'Master Bedroom', w: 25, d: 25, h: 48, x: 10.6, z: 1.10, rot: 0, swatch: 0 },
    { id: 'bed2', name: 'Neiden single bed', cat: 'beds', ic: 'catBed', price: 199, room: 'Bedroom 2', w: 90, d: 200, h: 38, x: 1.20, z: 1.60, rot: 0, swatch: 4 },
    { id: 'dsk1', name: 'Micke desk', cat: 'storage', ic: 'catStorage', price: 149, room: 'Bedroom 2', w: 105, d: 50, h: 75, x: 2.80, z: 0.70, rot: 0, swatch: 3 },
    { id: 'ktc1', name: 'Kitchen run · 3.0 m', cat: 'kitchen', ic: 'catKitchen', price: 1890, room: 'Kitchen', w: 300, d: 60, h: 90, x: 6.40, z: 11.0, rot: 0, swatch: 3 },
  ].map((p) => Object.assign(p, { catLabel: CAT_LABEL[p.cat] || p.cat }));

  S.issues = [
    { id: 'iss1', sev: 'error', item: 'wrd1', title: 'Wardrobe blocks door swing', detail: 'The master-bedroom door (80 cm) can’t fully open — it overlaps the Pax wardrobe by 14 cm.', fix: 'Shift the wardrobe 200 mm along the wall.' },
    { id: 'iss2', sev: 'warn', item: 'cof1', title: 'Tight walkway at the sofa', detail: 'The gap between the Halmstad 3-seater and the Lisabo coffee table is 72 cm. HDB-friendly minimum is 90 cm.', fix: 'Move the coffee table 180 mm toward the console.' },
    { id: 'iss3', sev: 'warn', item: 'din1', title: 'Dining chair pull-out is tight', detail: 'Only 68 cm behind the Ekedalen table on the wall side; 75 cm is recommended to seat comfortably.', fix: null },
  ];

  let verSeq = 3;
  S.versions = [
    { id: 'v0', name: 'Working layout', when: 'Edited just now', items: 15, cost: 5701, current: true, f: [[14, 58, 52, 16, 'soft'], [26, 46, 28, 10, 'wood'], [20, 30, 40, 6, 'tv'], [12, 40, 56, 30, 'rug'], [60, 30, 9, 9, 'plant'], [60, 14, 26, 16, 'wood']] },
    { id: 'v1', name: 'Move-in baseline', when: '2 days ago', items: 11, cost: 4180, f: [[12, 52, 44, 14, 'soft'], [30, 40, 26, 8, 'wood'], [22, 28, 38, 6, 'tv'], [14, 36, 52, 26, 'rug']] },
    { id: 'v2', name: 'Entertainer option', when: 'Apr 28', items: 18, cost: 6920, f: [[10, 46, 40, 14, 'soft'], [10, 46, 14, 28, 'soft'], [28, 34, 24, 8, 'tv'], [58, 16, 28, 16, 'wood'], [60, 10, 6, 6, 'round'], [78, 10, 6, 6, 'round'], [60, 36, 6, 6, 'round']] },
  ];


  // ---- helpers ----
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const money = (n) => '$' + Math.round(n).toLocaleString('en-SG');
  const modalWrap = (id, inner) => `<div class="modal-overlay" data-modal="${id}" data-anim-key="modal:${id}">${inner}</div>`;
  const uid = () => 'p' + Math.random().toString(36).slice(2, 8);
  const selected = () => S.placed.find((p) => p.id === S.selectedId) || null;

  // alternatives for Swap: same category, near footprint, from the catalog pool
  function getAlternatives(it) {
    const pool = itemsFor(it.cat).map((row) => ({ name: row[0], price: row[1], ic: row[2], w: it.w + (((row[0].length * 7) % 60) - 28) }));
    const seen = new Set();
    const list = [{ name: it.name, price: it.price, ic: it.ic, w: it.w }];
    pool.forEach((a) => { if (a.name !== it.name && !seen.has(a.name)) { seen.add(a.name); list.push(a); } });
    return list.slice(0, 6);
  }

  function deleteSel() {
    const it = selected(); if (!it) return;
    if (it.locked) { toast('<b>' + it.name + '</b> is locked', { icon: 'lock', err: true }); return; }
    const idx = S.placed.indexOf(it);
    S.placed.splice(idx, 1);
    S.selectedId = (S.placed[idx] || S.placed[idx - 1] || {}).id || null;
    render();
    toast('Deleted <b>' + it.name + '</b>', { icon: 'trash', action: 'Undo', onAction: () => { S.placed.splice(Math.min(idx, S.placed.length), 0, it); S.selectedId = it.id; render(); } });
  }
  function duplicateSel() {
    const it = selected(); if (!it) return;
    const copy = Object.assign({}, it, { id: uid(), x: (it.x || 0) + 0.4, z: (it.z || 0) + 0.4, locked: false });
    S.placed.splice(S.placed.indexOf(it) + 1, 0, copy);
    S.selectedId = copy.id; render();
    toast('Duplicated <b>' + it.name + '</b>', { icon: 'copy' });
  }
  function addFurniture(name, price, ic, cat) {
    const it = { id: uid(), name, price, ic: ic || 'catOther', cat: cat || 'decor', catLabel: CAT_LABEL[cat] || 'Decor', room: 'Living / Dining', w: 80, d: 60, h: 75, x: 3.0, z: 7.0, rot: 0, swatch: 1 };
    S.placed.push(it); S.selectedId = it.id; S.inspectorOpen = true;
    render();
    toast('Added <b>' + name + '</b> to Living / Dining', { icon: 'plus', action: 'Undo', onAction: () => { S.placed = S.placed.filter((p) => p.id !== it.id); render(); } });
  }
  function saveVersion() {
    const cost = S.placed.reduce((a, p) => a + p.price, 0);
    S.versions.forEach((v) => (v.current = false));
    const f = (S.versions[0] && S.versions[0].f) || [];
    S.versions.unshift({ id: 'v' + verSeq++, name: 'Version ' + verSeq, when: 'Saved just now', items: S.placed.length, cost, current: true, f });
    if (S.versions.length > 8) S.versions.pop();
    render();
    toast('Saved <b>Version ' + verSeq + '</b> · ' + S.placed.length + ' items', { icon: 'save' });
  }

  // ---- toast (imperative; survives re-render) ----
  function toast(msg, opts = {}) {
    let host = stage.querySelector('.toast-host');
    if (!host) { host = el('<div class="toast-host"></div>'); stage.appendChild(host); }
    const t = el(`<div class="toast ${opts.err ? 'err' : ''}">${opts.icon ? icon(opts.icon, 16) : ''}<span class="toast-msg">${msg}</span>${opts.action ? `<button class="toast-act">${opts.action}</button>` : ''}</div>`);
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    let done = false;
    const dismiss = () => { if (done) return; done = true; t.classList.remove('in'); setTimeout(() => t.remove(), 200); };
    if (opts.action && opts.onAction) t.querySelector('.toast-act').addEventListener('click', () => { opts.onAction(); dismiss(); });
    setTimeout(dismiss, opts.duration || 3600);
  }

  function openOnlyPanel(id) { Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); S.panels[id] = true; S.openMenu = null; S.appearanceOpen = false; render(); }
  function goScreen(scr) { S.screen = scr; S.openMenu = null; S.appearanceOpen = false; Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); render(); applyTheme(); }
  function closeCmdk() { S.cmdk = false; S.cmdQuery = ''; S.cmdIdx = 0; }

  // Partial update of just the palette results — avoids tearing down the
  // overlay/input on every keystroke (which replayed entrance animations
  // and caused flicker). Rebuilds only the .cmdk-results subtree.
  function updateCmdkResults() {
    const cur = stage.querySelector('.cmdk-results');
    if (!cur) return;
    const fresh = el(Features.cmdk(S, buildCommands()));
    const next = fresh.querySelector('.cmdk-results');
    cur.replaceWith(next);
  }

  // Partial update of the catalog only — avoids re-rendering the toolbar,
  // inspector, nav and scene on every search keystroke. Preserves focus +
  // caret on the search field so typing never flickers.
  function updateCatalog() {
    const cur = stage.querySelector('#catalog');
    if (!cur) return;
    const focused = document.activeElement && document.activeElement.id === 'catSearch';
    const caret = focused ? document.activeElement.selectionStart : null;
    const grid = cur.querySelector('.card-grid');
    const scroll = grid ? grid.scrollTop : 0;
    cur.replaceWith(el(catalogHTML()));
    const ng = stage.querySelector('#catalog .card-grid'); if (ng) ng.scrollTop = scroll;
    if (focused) { const ni = stage.querySelector('#catSearch'); if (ni) { ni.focus(); try { ni.setSelectionRange(caret, caret); } catch (_) {} } }
  }

  // ---- command palette command list (grouped, query-filtered) ----
  function buildCommands() {
    const q = (S.cmdQuery || '').toLowerCase();
    const it = selected();
    const groups = [
      { group: 'Actions', items: [
        { id: 'c-save', label: 'Save version', ic: 'save', kbd: '⌃S', run: () => { closeCmdk(); saveVersion(); } },
        { id: 'c-dup', label: 'Duplicate selection', ic: 'copy', kbd: '⌃D', run: () => { closeCmdk(); duplicateSel(); } },
        { id: 'c-del', label: 'Delete selection', ic: 'trash', kbd: '⌫', run: () => { closeCmdk(); deleteSel(); } },
        { id: 'c-rot', label: 'Rotate 90°', ic: 'rotate', kbd: 'R', run: () => { closeCmdk(); if (it) { it.rot = ((it.rot || 0) + 90) % 360; render(); toast('Rotated to ' + it.rot + '°', { icon: 'rotate' }); } } },
        { id: 'c-swap', label: 'Swap selection with similar…', ic: 'copy', run: () => { closeCmdk(); if (it) { S.panels.swap = true; render(); } } },
        { id: 'c-tidy', label: 'Tidy up room', ic: 'tidy', kbd: 'L', run: () => { closeCmdk(); toast('Tidied — items snapped to walls', { icon: 'tidy' }); } },
        { id: 'c-measure', label: (S.measure ? 'Hide' : 'Show') + ' clearances', ic: 'ruler', kbd: 'M', run: () => { closeCmdk(); S.measure = !S.measure; render(); } },
      ] },
      { group: 'Tools & panels', items: [
        { id: 'c-shop', label: 'Shopping list & budget', ic: 'budget', run: () => { closeCmdk(); openOnlyPanel('budget'); } },
        { id: 'c-clr', label: 'Clearance checks', ic: 'ruler', run: () => { closeCmdk(); openOnlyPanel('clearance'); } },
        { id: 'c-ver', label: 'Versions & compare', ic: 'save', run: () => { closeCmdk(); openOnlyPanel('versions'); } },
        { id: 'c-layers', label: 'Objects / layers', ic: 'layers', run: () => { closeCmdk(); S.catalogOpen = true; S.leftMode = 'layers'; render(); } },
        { id: 'c-share', label: 'Share design…', ic: 'upload', run: () => { closeCmdk(); openOnlyPanel('share'); } },
        { id: 'c-appear', label: 'Appearance & theme', ic: 'palette', run: () => { closeCmdk(); S.appearanceOpen = true; render(); } },
        { id: 'c-help', label: 'Help & shortcuts', ic: 'help', kbd: '?', run: () => { closeCmdk(); openOnlyPanel('help'); } },
      ] },
      { group: 'Go to', items: [
        { id: 'c-orbit', label: 'Orbit (dollhouse) view', ic: 'cube', run: () => { closeCmdk(); goScreen('sandbox'); } },
        { id: 'c-walk', label: 'First-person walk', ic: 'walk', run: () => { closeCmdk(); goScreen('walk'); } },
        { id: 'c-plan', label: '2D floor plan', ic: 'topView', run: () => { closeCmdk(); goScreen('plan'); } },
        { id: 'c-edit', label: 'Edit room finishes', ic: 'palette', run: () => { closeCmdk(); goScreen('editroom'); } },
      ] },
    ];
    const pool = CATS.flatMap((c) => itemsFor(c[0]));
    const seen = new Set(); const adds = [];
    pool.forEach((row) => { if (seen.has(row[0])) return; seen.add(row[0]); adds.push({ id: 'add-' + row[0], label: 'Add ' + row[0], ic: row[2], hint: money(row[1]), run: () => { closeCmdk(); addFurniture(row[0], row[1], row[2]); } }); });
    groups.push({ group: 'Add furniture', items: q ? adds : adds.slice(0, 4) });
    return groups
      .map((g) => ({ label: g.group, items: g.items.filter((c) => !q || c.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length);
  }

  // ---- item / panel action helpers ----
  function catFromIcon(ic) { const c = CATS.find((x) => x[2] === ic); return c ? c[0] : 'decor'; }
  function handleItemAction(a) {
    const it = selected();
    if (a === 'swap') { S.panels.swap = true; render(); }
    else if (a === 'duplicate' || a === 'copy') { duplicateSel(); }
    else if (a === 'delete') { deleteSel(); }
    else if (a === 'rotate') { if (it) it.rot = ((it.rot || 0) + 90) % 360; render(); }
    else if (a === 'flipH') { S.flipH = !S.flipH; render(); }
    else if (a === 'flipV') { render(); toast('Flipped vertically', { icon: 'flipV' }); }
    else if (a === 'lock') { if (it) it.locked = !it.locked; render(); }
    else if (a === 'hide') { if (it) it.hidden = !it.hidden; render(); }
    else if (a === 'align') { render(); toast('Aligned to room', { icon: 'alignX' }); }
    else if (a === 'front') { if (it) { S.placed.splice(S.placed.indexOf(it), 1); S.placed.push(it); } render(); toast('Brought to front', { icon: 'layers' }); }
    else render();
  }
  function toggleFav(key) {
    const [name, price, ic] = key.split('|');
    const i = S.collections.findIndex((c) => c.name === name);
    if (i >= 0) { S.collections.splice(i, 1); render(); toast('Removed from collection', { icon: 'star' }); }
    else { S.collections.push({ name, price: Number(price), ic, cat: catFromIcon(ic) }); render(); toast('Saved <b>' + name + '</b> to collection', { icon: 'star' }); }
  }
  function changeQty(id, d) {
    const ref = S.placed.find((p) => p.id === id); if (!ref) return;
    if (d > 0) { S.placed.push(Object.assign({}, ref, { id: uid() })); render(); }
    else { const matches = S.placed.filter((p) => p.name === ref.name); if (matches.length > 1) { S.placed.splice(S.placed.indexOf(matches[matches.length - 1]), 1); render(); } }
  }
  function restoreVersion(id) {
    const v = S.versions.find((x) => x.id === id); if (!v) return;
    S.versions.forEach((x) => (x.current = x.id === id));
    S.compareVers = null; render();
    toast('Restored <b>' + v.name + '</b>', { icon: 'undo' });
  }


  // ---- toolbar ----
  function toolbarHTML() {
    if (isMobile()) return mobileBarHTML();
    const tbtn = (ic, tip, kbd, opts = '') =>
      `<button class="tool-btn tip" data-tip="${tip}${kbd ? `  ·  ${kbd}` : ''}" ${opts}>${icon(ic)}</button>`;
    const menu = (id, label, ic) =>
      `<button class="tool-btn tip" data-menu="${id}" data-tip="${label}">${icon(ic)}<span class="cap">${label}</span>${icon('chevronDown', 14)}</button>`;
    const issueN = (S.issues || []).length;
    return `
    <div class="toolbar" id="toolbar">
      <div class="brand-dot" title="HDB Sandbox">H</div>
      <div class="tool-divider"></div>
      <button class="tool-btn tip" data-cmdk data-tip="Search everything  ·  ⌘K">${icon('search')}</button>
      ${tbtn('undo', 'Undo', '⌃Z', 'data-tbact="undo"')}
      ${tbtn('redo', 'Redo', '⇧⌃Z', 'data-tbact="redo"')}
      <div class="tool-divider"></div>
      <button class="tool-btn tip ${S.catalogOpen && S.leftMode === 'catalog' ? 'active' : ''}" data-leftbtn="catalog" data-tip="Catalog  ·  C">${icon('grid')}</button>
      <button class="tool-btn tip ${S.catalogOpen && S.leftMode === 'layers' ? 'active' : ''}" data-leftbtn="layers" data-tip="Objects  ·  Y">${icon('layers')}</button>
      <button class="tool-btn tip ${S.measure ? 'active' : ''}" data-measure data-tip="Clearances  ·  M">${icon('ruler')}${issueN ? `<span class="nub warn">${issueN}</span>` : ''}</button>
      ${tbtn('tidy', 'Tidy up', 'L', 'data-tbact="tidy"')}
      <div class="tool-divider"></div>
      <div class="menu-wrap">${menu('view', 'View', 'eye')}</div>
      <div class="menu-wrap">${menu('scene', 'Scene', 'sun')}</div>
      <div class="menu-wrap">${menu('arrange', 'Arrange', 'layers')}</div>
      <div class="menu-wrap">${menu('tools', 'Tools', 'wrench')}</div>
      <div class="menu-wrap">${menu('file', 'File', 'file')}</div>
      <div class="tool-divider"></div>
      ${tbtn('upload', 'Share & export', '', 'data-toggle="share"')}
      ${tbtn('palette', 'Appearance', '', 'data-appearance')}
      ${tbtn('settings', 'Graphics', '', 'data-toggle="graphics"')}
      ${tbtn('help', 'Help', '?', 'data-toggle="help"')}
    </div>`;
  }

  // ---- mobile: collapsed toolbar + single dropdown menu ----
  function mobileBarHTML() {
    return `
    <div class="toolbar mobilebar" id="toolbar">
      <div class="brand-dot" title="HDB Sandbox">H</div>
      <span class="m-title">HDB Sandbox</span>
      <button class="tool-btn m-menu-btn ${S.mobileMenuOpen ? 'active' : ''}" data-mmenu aria-label="Menu">${icon('menu', 20)}</button>
    </div>`;
  }
  function mobileMenuHTML() {
    const item = (attr, ic, label, extra = '') =>
      `<button class="m-item" ${attr}>${icon(ic, 18)}<span>${label}</span>${extra}</button>`;
    const sectionFromMenu = (id) => {
      const m = MENUS[id];
      const rows = m.items.filter((it) => it !== 'sep').map((it) => {
        const [ic, label, sk, , panel, goto, act] = it;
        const attr = panel ? `data-openpanel="${panel}"` : goto ? `data-goto="${goto}"` : act ? `data-menuact="${act}"` : '';
        return item(attr, ic, label, sk ? `<kbd class="sk">${sk}</kbd>` : '');
      }).join('');
      return `<div class="m-sec"><div class="m-sec-h">${m.label}</div>${rows}</div>`;
    };
    return `
    <div class="m-menu-overlay" data-mmenuroot>
      <div class="m-sheet">
        <div class="m-sheet-grab"></div>
        <div class="m-sheet-head"><div class="panel-title">Menu</div>
          <button class="icon-btn" data-mmenu aria-label="Close">${icon('close', 16)}</button></div>
        <div class="m-sheet-body">
          <div class="m-sec">
            <div class="m-sec-h">Edit</div>
            ${item('data-leftbtn="catalog"', 'grid', 'Catalog', S.catalogOpen && S.leftMode === 'catalog' ? '<span class="m-on">On</span>' : '')}
            ${item('data-leftbtn="layers"', 'layers', 'Objects / layers', S.catalogOpen && S.leftMode === 'layers' ? '<span class="m-on">On</span>' : '')}
            ${item('data-cmdk', 'search', 'Search…')}
            ${item('data-measure', 'ruler', 'Clearances', '<kbd class="sk">M</kbd>')}
            ${item('data-tbact="tidy"', 'tidy', 'Tidy up room', '<kbd class="sk">L</kbd>')}
            <div class="m-row2">${item('data-tbact="undo"', 'undo', 'Undo')}${item('data-tbact="redo"', 'redo', 'Redo')}</div>
          </div>
          ${sectionFromMenu('view')}
          ${sectionFromMenu('scene')}
          ${sectionFromMenu('arrange')}
          ${sectionFromMenu('tools')}
          ${sectionFromMenu('file')}
          <div class="m-sec">
            <div class="m-sec-h">App</div>
            ${item('data-appearance', 'palette', 'Appearance')}
            ${item('data-toggle="graphics"', 'settings', 'Graphics')}
            ${item('data-toggle="help"', 'help', 'Help & shortcuts')}
          </div>
        </div>
      </div>
    </div>`;
  }
  const MENUS = {
    view: { label: 'Camera & view', items: [
      ['cube', 'Orbit (dollhouse)', 'V', false, null, 'sandbox'], ['walk', 'First-person walk', 'V', false, null, 'walk'],
      ['topView', '2D floor plan', 'O', false, null, 'plan'], ['home', 'Reset view', 'H', false, null, null, 'reset'],
      'sep', ['turntable', 'Turntable record', '', false, null, null, 'rep'], ['grid', 'Edit room…', '', false, null, 'editroom'],
    ]},
    scene: { label: 'Lighting & finishes', items: [
      ['sun', 'Time of day', 'T', false, null, null, 'rep'], ['palette', 'Wall & floor finishes…', '', false, null, 'editroom'],
      'sep', ['fps', 'Show FPS counter', '', false, null, null, 'rep'], ['pin', 'Set location…', '', false, null, null, 'rep'],
    ]},
    arrange: { label: 'Arrange', items: [
      ['layers', 'Objects / layers…', 'Y', false, null, null, 'layers'], ['grid', 'Layout presets…', '', false, 'presets'],
      'sep', ['alignX', 'Align selection', '', false, null, null, 'align'], ['distribute', 'Distribute evenly', '', false, null, null, 'distribute'], ['group', 'Group selection', '⌃G', false, null, null, 'group'],
    ]},
    tools: { label: 'Design tools', items: [
      ['budget', 'Budget & shopping list', '', false, 'budget'], ['ruler', 'Clearance checks', 'M', false, 'clearance'],
      ['sun', 'Sun study', '', false, null, null, 'rep'], ['walk', 'Walkthrough tour', '', false, null, 'walk'], ['file', 'Design report', '', false, null, null, 'report'],
    ]},
    file: { label: 'File', items: [
      ['save', 'Save version', '⌃S', false, null, null, 'saveversion'], ['folder', 'Versions & open…', '', false, 'versions'],
      'sep', ['upload', 'Share design…', '', false, 'share'], ['download', 'Export PNG…', '', false, 'share'], ['file', 'Import .glb model…', '', false, null, null, 'rep'],
    ]},
  };
  function menuHTML(id) {
    const m = MENUS[id];
    const rows = m.items.map((it) => {
      if (it === 'sep') return '<div class="menu-sep"></div>';
      const [ic, label, sk, , panel, goto, act] = it;
      const attr = panel ? `data-openpanel="${panel}"` : goto ? `data-goto="${goto}"` : act ? `data-menuact="${act}"` : '';
      return `<button class="menu-item" ${attr}>${icon(ic, 17)}<span>${label}</span>${sk ? `<kbd class="sk">${sk}</kbd>` : ''}</button>`;
    }).join('');
    return `<div class="menu" data-menufor="${id}" data-anim-key="menu:${id}"><div class="menu-label">${m.label}</div>${rows}</div>`;
  }

  // ---- left dock: Catalog ⇄ Layers ----
  const PAGE = 8;
  function catalogHTML() {
    const seg = `<div class="left-modeseg"><div class="seg">
      <button class="${S.leftMode === 'catalog' ? 'on' : ''}" data-leftmode="catalog">Catalog</button>
      <button class="${S.leftMode === 'layers' ? 'on' : ''}" data-leftmode="layers">Layers</button>
    </div></div>`;
    if (S.leftMode === 'layers') {
      return `
      <aside class="panel catalog" id="catalog">
        <div class="panel-head"><div><div class="panel-title">Objects</div></div>
          <button class="icon-btn" data-toggle="catalog">${icon('close', 16)}</button></div>
        ${seg}
        <hr class="hr"/>
        ${Features.layersBody(S)}
      </aside>`;
    }
    const tab = (id, label) => `<button class="tab ${S.tab === id ? 'on' : ''}" data-cattab="${id}">${label}</button>`;
    const all = S.query
      ? Object.keys(ITEMS).flatMap(itemsFor).concat([])
      : itemsFor(S.category);
    const list = S.query ? allSearch(S.query) : all;
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const pg = Math.min(S.page, pages - 1);
    const shown = list.slice(pg * PAGE, pg * PAGE + PAGE);
    const saved = new Set((S.collections || []).map((c) => c.name));
    const cards = shown.length ? shown.map((it) => {
      const key = `${it[0]}|${it[1]}|${it[2]}`;
      return `
      <div class="cat-card" data-catadd="${key}" title="Click to add to your room">
        <button class="fav-btn ${saved.has(it[0]) ? 'on' : ''}" data-fav="${key}" title="Save to collection">${icon('star', 13)}</button>
        <div class="card-thumb">${icon(it[2], 34, 1.5)}</div>
        <span class="nm">${it[0]}</span>
        <span class="pr"><b>${money(it[1])}</b></span>
      </div>`; }).join('')
      : `<p style="grid-column:1/-1;text-align:center;color:var(--text-3);font-size:var(--t-xs);padding:24px 0">No matches${S.query ? ` for “${S.query}”` : ''}.</p>`;
    const rail = S.query ? '' : `<div class="cat-rail">${CATS.map((c) =>
      `<button class="chip ${S.category === c[0] ? 'on' : ''}" data-cat="${c[0]}">${icon(c[2], 14, 1.6)}${c[1]}</button>`).join('')}</div>`;
    const pager = pages > 1 ? `<div class="pager">
      <button data-page="-1">${icon('chevronLeft', 14)} Prev</button>
      <span class="mono">${pg + 1} / ${pages}</span>
      <button data-page="1">Next ${icon('chevronRight', 14)}</button></div>` : '';
    return `
    <aside class="panel catalog" id="catalog">
      <div class="panel-head">
        <div><div class="panel-title">Catalog</div></div>
        <button class="icon-btn" data-toggle="catalog">${icon('close', 16)}</button>
      </div>
      ${seg}
      <div class="cat-tabsrow">${tab('builtin', 'Built-in')}${tab('browse', 'Browse CC0')}${tab('packs', 'Packs')}</div>
      <hr class="hr"/>
      <div class="cat-search"><div class="field">${icon('search', 16)}<input class="input" id="catSearch" placeholder="Search 75+ items…" value="${S.query}"/></div></div>
      ${rail}
      <div class="card-grid">${cards}</div>
      ${pager}
      <div class="cat-foot">
        <span class="hint">Click or drag to place · <kbd>R</kbd> rotates</span>
        <button class="btn btn-soft btn-sm">${icon('upload', 14)} Upload</button>
      </div>
    </aside>`;
  }
  function allSearch(q) {
    q = q.toLowerCase();
    const pool = CATS.flatMap((c) => itemsFor(c[0]));
    return pool.filter((it) => it[0].toLowerCase().includes(q));
  }

  // ---- inspector (data-driven from selected item) ----
  function inspectorHTML() {
    const it = selected();
    if (!it) return '';
    const sw = SOFA_COLORS.map((c, i) => `<button class="swatch ${it.swatch === i ? 'on' : ''}" data-swatch="${i}" style="background:${c}"></button>`).join('');
    const soft = it.cat === 'seating' || it.cat === 'beds' || it.cat === 'textiles';
    const issue = (S.issues || []).find((q) => q.item === it.id);
    const issueChip = issue ? `<div class="sec" style="padding-top:var(--s-4);padding-bottom:0;border:none">
        <button class="clr-item ${issue.sev}" data-clrissue="${issue.id}">
          <div class="ci-head"><span class="badge ${issue.sev === 'error' ? 'err' : 'warn'}">${issue.sev === 'error' ? 'Blocking' : 'Tight'}</span><span class="ci-title">${issue.title}</span></div>
        </button></div>` : '';
    const matSeg = soft ? `<div class="sec">
        <div class="sec-h">Material <span class="mono" style="color:var(--text-3)">${it.mat || 'Linen'} weave</span></div>
        <div class="seg" style="width:100%" id="weaveSeg">
          <button class="${(it.mat || 'Linen') === 'Linen' ? 'on' : ''}" style="flex:1">Linen</button><button class="${it.mat === 'Bouclé' ? 'on' : ''}" style="flex:1">Bouclé</button><button class="${it.mat === 'Velvet' ? 'on' : ''}" style="flex:1">Velvet</button>
        </div>
        <div style="margin-top:10px">
          <div style="display:flex;justify-content:space-between;font-size:var(--t-xs);color:var(--text-3);font-weight:600;margin-bottom:4px"><span>Sheen</span><span class="mono">${it.sheen || 0}%</span></div>
          <input type="range" class="slider" min="0" max="100" value="${it.sheen || 0}" data-sheen/>
        </div>
      </div>` : '';
    return `
    <aside class="panel inspector" id="inspector">
      <div class="panel-head" style="align-items:flex-start">
        <div style="display:flex;gap:10px">
          <div class="insp-thumb">${icon(it.ic, 24, 1.5)}</div>
          <div>
            <div class="panel-title">${it.name}</div>
            <div class="panel-sub">${it.catLabel || it.cat}</div>
            <div class="dims mono">${it.w} × ${it.d} × ${it.h} cm</div>
          </div>
        </div>
        <button class="icon-btn" data-deselect>${icon('close', 16)}</button>
      </div>
      <hr class="hr"/>
      <div class="panel-body">
        ${issueChip}
        <div class="sec" ${issue ? 'style="border-top:none"' : ''}>
          <div class="sec-h">Transform</div>
          <div class="transform-grid">
            <label class="num"><span>X</span><input class="mono" value="${(it.x || 0).toFixed(2)}" data-tf="x"/><i class="unit">m</i></label>
            <label class="num"><span>Z</span><input class="mono" value="${(it.z || 0).toFixed(2)}" data-tf="z"/><i class="unit">m</i></label>
            <label class="num"><span>Rotation</span><input class="mono" value="${it.rot || 0}" data-tf="rot"/><i class="unit">°</i></label>
          </div>
        </div>
        <div class="sec">
          <div class="sec-h">Colour</div>
          <div class="swatches">${sw}</div>
        </div>
        ${matSeg}
        <div class="sec">
          <button class="btn btn-soft btn-block" data-act="swap" style="margin-bottom:var(--s-3)">${icon('copy', 14)} Swap with similar</button>
          <div class="action-grid">
            <button class="act" data-act="rotate">${icon('rotate', 18)}Rotate</button>
            <button class="act ${S.flipH ? 'on' : ''}" data-act="flipH">${icon('flipH', 18)}Flip H</button>
            <button class="act" data-act="flipV">${icon('flipV', 18)}Flip V</button>
            <button class="act" data-act="copy">${icon('copy', 18)}Duplicate</button>
            <button class="act ${it.locked ? 'on' : ''}" data-act="lock">${icon(it.locked ? 'lock' : 'unlock', 18)}${it.locked ? 'Locked' : 'Lock'}</button>
            <button class="act danger" data-act="delete">${icon('trash', 18)}Delete</button>
          </div>
        </div>
      </div>
    </aside>`;
  }

  // ---- navcluster (minimap + compass + zoom) ----
  // Parts are mode-specific:
  //   orbit (sandbox) → zoom + compass        walk → minimap        editroom → zoom
  function navHTML(parts) {
    parts = parts || {};
    const rooms = [
      [6, 6, 30, 26, 'Main', 0], [40, 6, 26, 26, 'Bed', 0], [70, 6, 30, 26, 'Bed', 0],
      [104, 6, 56, 50, 'Living', 1], [6, 36, 24, 20, 'Bath', 0], [34, 36, 24, 20, 'Bath', 0],
      [62, 36, 22, 20, 'HS', 0], [40, 60, 60, 22, 'Kitchen', 0], [6, 60, 30, 22, 'Yard', 0],
    ];
    const rr = rooms.map((r) =>
      `<rect class="mm-room ${r[5] ? 'lit' : ''}" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="2"/>` +
      `<text class="mm-label" x="${r[0] + 3}" y="${r[1] + 11}">${r[4]}</text>`).join('');
    // Compass is fused into the top of the zoom rail (one cohesive control)
    // rather than floating as a separate circle beside it.
    const compassCell = parts.compass ? `
        <div class="compass-cell tip" data-tip="Facing North-East">
          <span class="cc-n">N</span>
          <svg width="20" height="20" viewBox="0 0 30 30" style="transform:rotate(28deg)">
            <polygon points="15,5 19,16 15,13 11,16" fill="var(--accent)"/>
            <polygon points="15,25 19,14 15,17 11,14" fill="var(--text-3)"/>
          </svg>
        </div>
        <div class="div"></div>` : '';
    const zoom = parts.zoom ? `
      <div class="zoom">
        ${compassCell}
        <button class="tip" data-tip="Zoom in">${icon('plus', 16)}</button>
        <div class="div"></div>
        <button class="tip" data-tip="Zoom out">${icon('minus', 16)}</button>
        <div class="div"></div>
        <button class="tip" data-tip="Reset view">${icon('home', 16)}</button>
      </div>` : '';
    // standalone compass only if a future mode wants it without zoom
    const compass = (parts.compass && !parts.zoom) ? `
      <div class="compass tip" data-tip="Facing North-East">
        <span class="n">N</span>
        <svg width="30" height="30" viewBox="0 0 30 30" style="transform:rotate(28deg)">
          <polygon points="15,5 19,16 15,13 11,16" fill="var(--accent)"/>
          <polygon points="15,25 19,14 15,17 11,14" fill="var(--text-3)"/>
        </svg>
      </div>` : '';
    const minimap = parts.minimap ? `
      <div class="minimap">
        <svg viewBox="0 0 166 88">
          ${rr}
          <g class="mm-cam"><circle cx="128" cy="30" r="4"/><path d="M128 30 L116 18 L140 18 Z" opacity="0.35"/></g>
        </svg>
      </div>` : '';
    if (!zoom && !compass && !minimap) return '';
    return `<div class="navcluster">${zoom}${compass}${minimap}</div>`;
  }

  // ---- budget ----
  function budgetHTML() {
    const total = BUDGET.reduce((a, b) => a + b[1], 0);
    const bars = BUDGET.map((b) => `<div class="bud-seg" style="width:${(b[1] / total * 100).toFixed(1)}%;background:${b[2]}"></div>`).join('');
    const rows = BUDGET.map((b) => `<div class="row"><span class="rk"><span class="legend-dot" style="background:${b[2]}"></span>${b[0]}</span><span class="amt">${money(b[1])}</span></div>`).join('');
    return `
    <aside class="panel mini aux" id="budgetPanel">
      <div class="panel-head"><div class="panel-title">Budget</div>
        <button class="icon-btn" data-closepanel="budget">${icon('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="bud-total" style="padding-top:12px"><span class="panel-sub">5 items · est. total</span><span class="big mono">${money(total)}</span></div>
        <div class="bud-bar">${bars}</div>
        <div class="bud-list">${rows}</div>
        <button class="btn btn-soft btn-block" style="margin-top:12px">${icon('download', 14)} Export shopping list</button>
      </div>
    </aside>`;
  }

  // ---- graphics (centered modal) ----
  function graphicsHTML() {
    const tiers = ['Fast', 'Medium', 'High', 'Maximum'];
    const seg = tiers.map((t, i) => `<button class="${i === 0 ? 'on' : ''}" style="flex:1">${t}</button>`).join('');
    const toggleRow = (ic, name, on) => `<div class="row"><span class="rk">${icon(ic, 16)}${name}</span><button class="switch ${on ? 'on' : ''}" data-switch></button></div>`;
    return `
    <aside class="panel mini" id="graphicsPanel">
      <div class="panel-head"><div class="panel-title">Graphics</div>
        <button class="icon-btn" data-closepanel="graphics">${icon('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="sec" style="border:none;padding-top:14px">
          <div class="sec-h">Render quality</div>
          <div class="seg accent fit" style="width:100%">${seg}</div>
          <p style="font-size:var(--t-2xs);color:var(--text-3);margin:8px 0 0;line-height:1.5">Flat IKEA-style renderer — instant load, no real-time shadows.</p>
        </div>
        <div class="sec">
          <div class="sec-h">Asset quality</div>
          <div class="seg fit" style="width:100%"><button style="flex:1" class="on">Auto</button><button style="flex:1">Low</button><button style="flex:1">Med</button><button style="flex:1">Orig</button></div>
        </div>
        <div class="sec">
          ${toggleRow('sun', 'Sun shadows', false)}
          ${toggleRow('eye', 'Reflections', false)}
          ${toggleRow('star', 'Bloom & AO', false)}
          ${toggleRow('fps', 'FPS counter', true)}
        </div>
      </div>
    </aside>`;
  }

  // ---- finishes ----
  function finishesHTML() {
    const cells = FINISHES.map((f, i) => `
      <div class="finish-cell ${i === 0 ? 'on' : ''}" data-finish="${i}">
        <div class="swatch-lg" style="background:${f[1]}"></div>
        <div class="name">${f[0]}</div>
      </div>`).join('');
    return `
    <aside class="panel mini aux" id="finishPanel" style="width:330px">
      <div class="panel-head"><div><div class="panel-title">Floor finish</div><div class="panel-sub">Living / Dining</div></div>
        <button class="icon-btn" data-closepanel="finishes">${icon('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="seg" style="margin:12px 0"><button class="on">Floor</button><button>Walls</button></div>
        <div class="finish-grid">${cells}</div>
      </div>
    </aside>`;
  }

  // ---- help (centered modal) ----
  function helpHTML() {
    const SHORTCUTS = [
      ['Catalog', 'C'], ['Measurements', 'M'], ['Tidy up room', 'L'],
      ['Cycle view', 'V'], ['Top-down plan', 'O'], ['Reset view', 'H'],
      ['Rotate item', 'R'], ['Duplicate', '⌃D'], ['Delete', '⌫'],
      ['Undo', '⌃Z'], ['Redo', '⇧⌃Z'], ['Save layout', '⌃S'],
    ];
    const rows = SHORTCUTS.map(([n, k]) =>
      `<div class="kbd-row"><span>${n}</span><kbd>${k}</kbd></div>`).join('');
    return `
    <aside class="panel" id="helpPanel">
      <div class="panel-head"><div><div class="panel-title">Help & shortcuts</div><div class="panel-sub">HDB Sandbox</div></div>
        <button class="icon-btn" data-closepanel="help">${icon('close', 16)}</button></div>
      <hr class="hr"/>
      <div class="panel-body">
        <div class="sec" style="border:none;padding-top:14px">
          <div class="sec-h">Keyboard shortcuts</div>
          <div class="kbd-grid">${rows}</div>
        </div>
        <div class="sec">
          <div class="sec-h">Getting around</div>
          <ul class="help-list">
            <li>${icon('drag', 15)}<span>Drag a catalog item onto the floor to place it.</span></li>
            <li>${icon('cube', 15)}<span>Drag empty space to orbit · scroll to zoom.</span></li>
            <li>${icon('ruler', 15)}<span>Hold <kbd>Alt</kbd> while moving to show clearances.</span></li>
          </ul>
        </div>
        <button class="btn btn-soft btn-block" data-replaytour>${icon('walk', 14)} Replay welcome tour</button>
      </div>
    </aside>`;
  }

  // ---- screen top bar (plan / walk) ----
  function screenBar(title) {
    return `<div class="screen-bar">
      <button class="sb-back" data-goto="sandbox">${icon('arrowLeft', 16)} 3D Sandbox</button>
      <div class="tool-divider"></div>
      <span class="sb-title">${title}</span>
      <div class="tool-divider"></div>
      <button class="tool-btn tip" data-appearance data-tip="Appearance">${icon('palette', 18)}</button>
    </div>`;
  }

  // ---- render ----
  // Scrollable regions whose position must survive a full re-render.
  const SCROLL_SEL = ['.card-grid', '.lyr-body', '.inspector .panel-body', '#shopPanel .panel-body', '#clearancePanel .panel-body', '#versionsPanel .panel-body', '.cmdk-results'];
  let prevAnimKeys = new Set();

  function render() {
    // 1. snapshot scroll positions before teardown
    const scrollMem = {};
    SCROLL_SEL.forEach((sel) => { const node = stage.querySelector(sel); if (node && node.scrollTop) scrollMem[sel] = node.scrollTop; });

    document.body.classList.toggle('mobile', isMobile());
    // remove everything except the persistent .scene backdrop + toast host
    [...stage.children].forEach((c) => { if (!c.classList.contains('scene') && !c.classList.contains('toast-host')) c.remove(); });
    const scene = stage.querySelector('.scene');
    if (scene) scene.style.display = S.screen === 'sandbox' ? '' : 'none';

    if (S.screen === 'sandbox') renderSandbox();
    else if (S.screen === 'plan') stage.insertAdjacentHTML('beforeend', Screens.plan(S.planTool, screenBar));
    else if (S.screen === 'walk') { stage.insertAdjacentHTML('beforeend', Screens.walk(S.walkRoom, screenBar)); stage.insertAdjacentHTML('beforeend', navHTML({ minimap: true })); }
    else if (S.screen === 'editroom') { stage.insertAdjacentHTML('beforeend', Flows.editRoom(S)); stage.insertAdjacentHTML('beforeend', navHTML({ zoom: true })); }

    if (S.appearanceOpen) stage.insertAdjacentHTML('beforeend', Screens.appearance(S.theme, S.modePref, THEME_META));
    if (S.loading) stage.insertAdjacentHTML('beforeend', Screens.loading(S.loadPct || 0));
    if (S.onboard && !S.loading) stage.insertAdjacentHTML('beforeend', Flows.onboarding(S));
    if (S.cmdk && !S.loading) stage.insertAdjacentHTML('beforeend', Features.cmdk(S, buildCommands()));

    // 2. restore scroll positions
    Object.keys(scrollMem).forEach((sel) => { const node = stage.querySelector(sel); if (node) node.scrollTop = scrollMem[sel]; });

    // 3. suppress entrance-animation replay for surfaces open both before AND
    //    after this render (only newly-appearing surfaces should animate).
    const curKeys = new Set();
    stage.querySelectorAll('[data-anim-key]').forEach((node) => {
      const k = node.dataset.animKey; curKeys.add(k);
      if (prevAnimKeys.has(k)) node.classList.add('no-anim');
    });
    prevAnimKeys = curKeys;
  }

  function renderSandbox() {
    const mob = isMobile();
    stage.insertAdjacentHTML('beforeend', toolbarHTML());
    // menus (desktop only — mobile collapses them into one dropdown)
    if (!mob) {
      const wraps = stage.querySelectorAll('.menu-wrap');
      wraps.forEach((w) => {
        const id = w.querySelector('[data-menu]').dataset.menu;
        w.style.position = 'relative';
        w.insertAdjacentHTML('beforeend', menuHTML(id));
      });
    }
    const showInspector = S.inspectorOpen && !S.empty && selected() && !(mob && S.catalogOpen);
    if (S.measure && !S.empty && selected()) stage.insertAdjacentHTML('beforeend', Features.guideOverlay(S));
    if (S.catalogOpen) stage.insertAdjacentHTML('beforeend', catalogHTML());
    if (showInspector) stage.insertAdjacentHTML('beforeend', inspectorHTML());
    stage.insertAdjacentHTML('beforeend', navHTML({ zoom: true, compass: true }));
    if (S.empty) stage.insertAdjacentHTML('beforeend', Flows.emptyOverlay());
    if (S.panels.budget) stage.insertAdjacentHTML('beforeend', Features.shopping(S));
    if (S.panels.clearance) stage.insertAdjacentHTML('beforeend', Features.clearance(S));
    if (S.panels.versions) stage.insertAdjacentHTML('beforeend', Features.versions(S));
    if (S.panels.finishes) stage.insertAdjacentHTML('beforeend', finishesHTML());
    if (S.panels.graphics) stage.insertAdjacentHTML('beforeend', modalWrap('graphics', graphicsHTML()));
    if (S.panels.help) stage.insertAdjacentHTML('beforeend', modalWrap('help', helpHTML()));
    if (S.panels.presets) stage.insertAdjacentHTML('beforeend', modalWrap('presets', Flows.presets(S)));
    if (S.panels.swap) stage.insertAdjacentHTML('beforeend', modalWrap('swap', Features.swap(S, getAlternatives)));
    if (S.panels.share) stage.insertAdjacentHTML('beforeend', modalWrap('share', Features.share(S)));
    if (!mob && S.openMenu) { const m = stage.querySelector(`[data-menufor="${S.openMenu}"]`); if (m) m.classList.add('open'); }
    if (mob && S.mobileMenuOpen) stage.insertAdjacentHTML('beforeend', mobileMenuHTML());
    if (S.ctx && selected()) stage.insertAdjacentHTML('beforeend', Features.ctxMenu(S));
  }

  function applyTheme() {
    stage.dataset.theme = S.theme;
    stage.dataset.mode = S.mode;
    stage.dataset.empty = S.empty ? '1' : '0';
    document.body.dataset.theme = S.theme;
    document.body.dataset.mode = S.mode;
    // Render synchronously — setting the attribute above already updates the
    // resolved CSS variables, and rAF is throttled in backgrounded/offscreen
    // frames which could leave the dollhouse blank on load.
    const mount = document.getElementById('sceneMount');
    if (mount) window.renderScene(mount);
  }

  function finishOnboard(skipRender) {
    S.onboard = false;
    try { localStorage.setItem('hdb_onboarded', '1'); } catch (e) {}
    if (!skipRender) render();
  }

  // ---- events ----
  document.addEventListener('click', (e) => {
    const t = e.target;
    const within = (sel) => t.closest(sel);

    // ---- mobile menu (single collapsed dropdown) ----
    if (within('[data-mmenu]')) { S.mobileMenuOpen = !S.mobileMenuOpen; render(); return; }
    if (S.mobileMenuOpen) {
      const mitem = within('.m-item');
      if (mitem) {
        S.mobileMenuOpen = false;
        const actionable = mitem.matches('[data-goto],[data-openpanel],[data-toggle],[data-appearance],[data-menuact],[data-leftbtn],[data-measure],[data-tbact],[data-cmdk]');
        if (!actionable) { render(); return; }
        // actionable: fall through so the existing handlers run + render
      } else {
        const ov = within('.m-menu-overlay');
        if (ov && t === ov) { S.mobileMenuOpen = false; render(); return; }
        if (within('.m-sheet')) return; // taps on sheet chrome do nothing
      }
    }

    // appearance switcher
    if (within('[data-appearance]')) { S.appearanceOpen = !S.appearanceOpen; S.openMenu = null; render(); return; }
    const setTheme = within('[data-settheme]');
    if (setTheme) { S.theme = setTheme.dataset.settheme; applyTheme(); render(); return; }
    const setMode = within('[data-setmode]');
    if (setMode) { S.modePref = setMode.dataset.setmode; applyTheme(); render(); return; }
    if (S.appearanceOpen && !within('.appearance')) { S.appearanceOpen = false; render(); return; }

    // ===== command palette =====
    if (within('[data-cmdk]')) { S.cmdk = true; S.cmdQuery = ''; S.cmdIdx = 0; S.openMenu = null; Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); render(); const ci = stage.querySelector('#cmdkInput'); if (ci) ci.focus(); return; }
    if (within('[data-cmdkroot]')) {
      const run = within('[data-cmdrun]');
      if (run) { const cmds = buildCommands().flatMap((g) => g.items); const c = cmds.find((x) => x.id === run.dataset.cmdrun); if (c) c.run(); return; }
      const root = within('[data-cmdkroot]');
      if (root && t === root) { closeCmdk(); render(); return; }
      return;
    }

    // ===== context menu =====
    const ctxact = within('[data-ctxact]');
    if (ctxact) { const a = ctxact.dataset.ctxact; S.ctx = null; handleItemAction(a); return; }
    if (S.ctx && !within('[data-ctxroot]')) { S.ctx = null; render(); return; }

    // ===== left dock mode (catalog / layers) =====
    const leftbtn = within('[data-leftbtn]');
    if (leftbtn) { const m = leftbtn.dataset.leftbtn; if (S.catalogOpen && S.leftMode === m) { S.catalogOpen = false; } else { S.catalogOpen = true; S.leftMode = m; } render(); return; }
    const leftmode = within('[data-leftmode]');
    if (leftmode) { S.leftMode = leftmode.dataset.leftmode; render(); return; }

    // ===== measure / clearance overlay toggle =====
    if (within('[data-measure]')) { S.measure = !S.measure; render(); toast(S.measure ? 'Clearances on — gaps under 90 cm are flagged' : 'Clearances hidden', { icon: 'ruler' }); return; }

    // ===== toolbar quick actions (undo/redo/tidy) =====
    const tba = within('[data-tbact]');
    if (tba) { const a = tba.dataset.tbact; Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); render();
      if (a === 'undo') toast('Nothing more to undo', { icon: 'undo' });
      else if (a === 'redo') toast('Nothing to redo', { icon: 'redo' });
      else if (a === 'tidy') toast('Tidied — items snapped to walls', { icon: 'tidy' });
      return; }

    // ===== menu special actions =====
    const mact = within('[data-menuact]');
    if (mact) {
      const a = mact.dataset.menuact; S.openMenu = null; S.mobileMenuOpen = false;
      if (a === 'saveversion') { render(); saveVersion(); }
      else if (a === 'layers') { S.catalogOpen = true; S.leftMode = 'layers'; render(); }
      else if (a === 'reset') { render(); toast('View reset to default', { icon: 'home' }); }
      else if (a === 'align') { render(); toast('Aligned selection to the room', { icon: 'alignX' }); }
      else if (a === 'distribute') { render(); toast('Distributed items evenly', { icon: 'distribute' }); }
      else if (a === 'group') { render(); toast('Grouped into a furniture set', { icon: 'group' }); }
      else if (a === 'report') { render(); toast('Design report exported · PDF', { icon: 'file' }); }
      else { render(); toast('Prototype — not wired up yet', { icon: 'help' }); }
      return;
    }

    // ===== layers panel =====
    const selobj = within('[data-selobj]');
    if (selobj && !within('[data-objlock],[data-objvis],[data-objdel]')) { S.selectedId = selobj.dataset.selobj; S.inspectorOpen = true; render(); return; }
    const objlock = within('[data-objlock]'); if (objlock) { const p = S.placed.find((q) => q.id === objlock.dataset.objlock); if (p) { p.locked = !p.locked; render(); } return; }
    const objvis = within('[data-objvis]'); if (objvis) { const p = S.placed.find((q) => q.id === objvis.dataset.objvis); if (p) { p.hidden = !p.hidden; render(); } return; }
    const objdel = within('[data-objdel]'); if (objdel) { S.selectedId = objdel.dataset.objdel; deleteSel(); return; }
    const lyrg = within('[data-lyrgroup]'); if (lyrg) { const k = lyrg.dataset.lyrgroup; S.lyrCollapsed[k] = !S.lyrCollapsed[k]; render(); return; }

    // ===== catalog add + favourite =====
    const fav = within('[data-fav]'); if (fav) { toggleFav(fav.dataset.fav); return; }
    const catadd = within('[data-catadd]'); if (catadd) { const parts = catadd.dataset.catadd.split('|'); addFurniture(parts[0], Number(parts[1]), parts[2], catFromIcon(parts[2])); return; }

    // ===== swap =====
    const swapuse = within('[data-swapuse]'); if (swapuse) { const parts = swapuse.dataset.swapuse.split('|'); const it = selected(); if (it) { it.name = parts[0]; it.price = Number(parts[1]); it.w = Number(parts[2]) || it.w; } S.panels.swap = false; render(); toast('Swapped to <b>' + parts[0] + '</b>', { icon: 'copy' }); return; }

    // ===== clearance issue → select offending item =====
    const clr = within('[data-clrissue]'); if (clr) { const iss = S.issues.find((q) => q.id === clr.dataset.clrissue); if (iss) { S.selectedId = iss.item; S.inspectorOpen = true; S.measure = true; } render(); return; }

    // ===== shopping list + collections =====
    const shoptab = within('[data-shoptab]'); if (shoptab) { S.shopTab = shoptab.dataset.shoptab; render(); return; }
    const shopqty = within('[data-shopqty]'); if (shopqty) { const parts = shopqty.dataset.shopqty.split('|'); changeQty(parts[0], Number(parts[1])); return; }
    if (within('[data-shopcart]')) { toast('Added <b>' + S.placed.length + ' items</b> to your IKEA cart', { icon: 'budget' }); return; }
    if (within('[data-shopexport]')) { toast('Shopping list exported · CSV', { icon: 'download' }); return; }
    const colladd = within('[data-colladd]'); if (colladd) { const c = S.collections[Number(colladd.dataset.colladd)]; if (c) addFurniture(c.name, c.price, c.ic, c.cat); return; }
    const collrm = within('[data-collremove]'); if (collrm) { S.collections.splice(Number(collrm.dataset.collremove), 1); render(); return; }

    // ===== versions =====
    if (within('[data-versave]')) { saveVersion(); return; }
    const vrest = within('[data-verrestore]'); if (vrest) { restoreVersion(vrest.dataset.verrestore); return; }
    const vcmp = within('[data-vercompare]'); if (vcmp) { S.compareVers = vcmp.dataset.vercompare; render(); return; }
    if (within('[data-comparedone]')) { S.compareVers = null; render(); return; }
    const vdel = within('[data-verdel]'); if (vdel) { S.versions = S.versions.filter((v) => v.id !== vdel.dataset.verdel); render(); toast('Version deleted', { icon: 'trash' }); return; }

    // ===== share & export =====
    const svis = within('[data-sharevis]'); if (svis) { S.shareVis = svis.dataset.sharevis; render(); return; }
    if (within('[data-copylink]')) { toast('Link copied to clipboard', { icon: 'copy' }); return; }
    if (within('[data-exportpng]')) { S.panels.share = false; render(); toast('Snapshot exported · PNG', { icon: 'download' }); return; }
    if (within('[data-exportpdf]')) { S.panels.share = false; render(); toast('Shoppable PDF exported', { icon: 'file' }); return; }

    // ===== modal close (swap / share) =====
    const cmodal = within('[data-closemodal]'); if (cmodal) { S.panels[cmodal.dataset.closemodal] = false; render(); return; }

    // screen routing (sandbox / plan / walk)
    const go = within('[data-goto]');
    if (go) { S.screen = go.dataset.goto; S.openMenu = null; S.appearanceOpen = false; Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); render(); applyTheme(); return; }
    // 2D plan tool selection
    const ptool = within('[data-plantool]');
    if (ptool) { S.planTool = ptool.dataset.plantool; render(); return; }

    // ---- Edit Room flow ----
    const erRoom = within('[data-editroom]');
    if (erRoom) { S.editRoomName = erRoom.dataset.editroom; render(); return; }
    const surf = within('[data-surface]');
    if (surf) { S.editSurface = surf.dataset.surface; render(); return; }
    const ftype = within('[data-ftype]');
    if (ftype) { const f = S.finishes[S.editSurface]; f.type = ftype.dataset.ftype; f.idx = 0; render(); return; }
    const fsw = within('[data-fswatch]');
    if (fsw) { S.finishes[S.editSurface].idx = Number(fsw.dataset.fswatch); render(); return; }
    const accw = within('[data-accentwall]');
    if (accw) { const k = accw.dataset.accentwall; S.accentWall = S.accentWall === k ? null : k; render(); return; }
    if (within('[data-applyall]')) {
      const src = S.finishes[S.editSurface];
      ['back', 'left', 'right'].forEach((k) => { S.finishes[k] = { type: src.type, idx: src.idx }; });
      render(); return;
    }

    // ---- Layout presets ----
    const pfilter = within('[data-presetfilter]');
    if (pfilter) { S.presetFilter = pfilter.dataset.presetfilter; render(); return; }
    const pcard = within('[data-preset]');
    if (pcard) { S.presetSel = pcard.dataset.preset; render(); return; }
    if (within('[data-applypreset]')) { if (S.presetSel) { S.empty = false; S.panels.presets = false; render(); applyTheme(); } return; }
    if (within('[data-startempty]')) { S.empty = true; S.panels.presets = false; render(); applyTheme(); return; }
    if (within('[data-fill-demo]')) { S.empty = false; render(); applyTheme(); return; }
    if (within('[data-replaytour]')) { S.panels.help = false; S.onbStep = 0; S.onboard = true; render(); return; }

    // ---- Onboarding ----
    if (within('[data-onbnext]')) { S.onbStep = Math.min(2, S.onbStep + 1); render(); return; }
    if (within('[data-onbprev]')) { S.onbStep = Math.max(0, S.onbStep - 1); render(); return; }
    if (within('[data-onbskip]')) { finishOnboard(); return; }
    const odot = within('[data-onbdot]');
    if (odot) { S.onbStep = Number(odot.dataset.onbdot); render(); return; }
    const ogoto = within('[data-onbgoto]');
    if (ogoto) {
      const dest = ogoto.dataset.onbgoto;
      finishOnboard(true);
      if (dest === 'empty') { S.empty = true; applyTheme(); }
      else if (dest === 'demo') { S.empty = false; applyTheme(); }
      else if (dest === 'presets') { S.empty = true; Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); S.panels.presets = true; applyTheme(); }
      render();
      return;
    }
    // onboarding backdrop: ignore clicks so it stays put

    // backdrop click on a centered modal closes it
    const overlay = within('.modal-overlay');
    if (overlay && t === overlay && overlay.dataset.modal) { S.panels[overlay.dataset.modal] = false; render(); return; }

    // menu open/close — opening any toolbar dropdown dismisses floating panels
    const menuBtn = within('[data-menu]');
    if (menuBtn) { Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); const id = menuBtn.dataset.menu; S.openMenu = S.openMenu === id ? null : id; render(); return; }
    const openPanel = within('[data-openpanel]');
    if (openPanel) { const id = openPanel.dataset.openpanel; Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); S.panels[id] = true; S.openMenu = null; render(); return; }
    if (!within('.menu') && S.openMenu) { S.openMenu = null; render(); return; }

    // toggles + panel closers
    const tog = within('[data-toggle]');
    if (tog) { const id = tog.dataset.toggle; if (id === 'catalog') { S.catalogOpen = !S.catalogOpen; render(); } else { const was = S.panels[id]; Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); S.panels[id] = !was; render(); } return; }
    const close = within('[data-closepanel]');
    if (close) { S.panels[close.dataset.closepanel] = false; render(); return; }
    if (within('[data-deselect]')) { S.inspectorOpen = false; render(); return; }

    // any other toolbar button (undo/redo/measure/tidy/help) dismisses open floating panels
    if (within('#toolbar .tool-btn')) { if (Object.values(S.panels).some(Boolean)) { Object.keys(S.panels).forEach((k) => (S.panels[k] = false)); render(); } return; }

    // catalog
    const cattab = within('[data-cattab]'); if (cattab) { S.tab = cattab.dataset.cattab; S.page = 0; render(); return; }
    const cat = within('[data-cat]'); if (cat) { S.category = cat.dataset.cat; S.page = 0; render(); return; }
    const pg = within('[data-page]'); if (pg) { S.page = Math.max(0, S.page + Number(pg.dataset.page)); render(); return; }

    // inspector — swatch is a pure class toggle; update in place (no full render)
    const sw = within('[data-swatch]'); if (sw) {
      const it = selected(); if (it) it.swatch = Number(sw.dataset.swatch);
      const wrap = sw.closest('.swatches');
      if (wrap) [...wrap.querySelectorAll('.swatch')].forEach((b, i) => b.classList.toggle('on', i === (it ? it.swatch : -1)));
      return;
    }
    const act = within('[data-act]'); if (act) { handleItemAction(act.dataset.act); return; }
    // material weave seg — toggle active + update the "<mat> weave" label in place
    const weave = t.closest('#weaveSeg button'); if (weave) {
      const it = selected(); if (it) it.mat = weave.textContent.trim();
      [...weave.parentElement.querySelectorAll('button')].forEach((b) => b.classList.toggle('on', b === weave));
      const sec = weave.closest('.sec'); const lbl = sec && sec.querySelector('.sec-h .mono');
      if (lbl && it) lbl.textContent = it.mat + ' weave';
      return;
    }
    // generic seg buttons (render/asset/etc.)
    const segb = within('.seg button:not([data-mode])');
    if (segb && segb.closest('.seg')) { segb.closest('.seg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === segb)); return; }
    const swc = within('[data-switch]'); if (swc) { swc.classList.toggle('on'); return; }
    const fin = within('[data-finish]'); if (fin) { stage.querySelectorAll('[data-finish]').forEach((f) => f.classList.toggle('on', f === fin)); return; }
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea';

    // command palette: ⌘K / Ctrl-K toggles from anywhere
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (S.cmdk) closeCmdk(); else { S.cmdk = true; S.cmdQuery = ''; S.cmdIdx = 0; S.openMenu = null; } render(); const ci = stage.querySelector('#cmdkInput'); if (ci) ci.focus(); return; }

    if (S.cmdk) {
      const cmds = buildCommands().flatMap((g) => g.items);
      if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); render(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); S.cmdIdx = Math.min(cmds.length - 1, S.cmdIdx + 1); updateCmdkResults(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); S.cmdIdx = Math.max(0, S.cmdIdx - 1); updateCmdkResults(); return; }
      if (e.key === 'Enter') { e.preventDefault(); const c = cmds[S.cmdIdx]; if (c) c.run(); return; }
      return;
    }

    if (e.key === 'Escape') {
      if (S.ctx) { S.ctx = null; render(); return; }
      const open = Object.keys(S.panels).filter((k) => S.panels[k]);
      if (open.length || S.openMenu || S.appearanceOpen) { open.forEach((k) => (S.panels[k] = false)); S.openMenu = null; S.appearanceOpen = false; render(); }
      return;
    }

    if (typing) return; // never hijack typing in a field

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveVersion(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key.toLowerCase();
    if (k === 'm') { S.measure = !S.measure; render(); }
    else if (k === 'c') { if (S.catalogOpen && S.leftMode === 'catalog') S.catalogOpen = false; else { S.catalogOpen = true; S.leftMode = 'catalog'; } render(); }
    else if (k === 'y') { if (S.catalogOpen && S.leftMode === 'layers') S.catalogOpen = false; else { S.catalogOpen = true; S.leftMode = 'layers'; } render(); }
    else if (k === 'r') { const it = selected(); if (it) { it.rot = ((it.rot || 0) + 90) % 360; render(); } }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (selected()) { e.preventDefault(); deleteSel(); } }
    else if (k === '?') { openOnlyPanel('help'); }
  });

  // right-click a placed item → context menu (desktop, sandbox only)
  document.addEventListener('contextmenu', (e) => {
    if (S.screen !== 'sandbox' || isMobile() || S.loading || S.onboard) return;
    if (e.target.closest('.panel, .toolbar, .menu, .modal-overlay, .cmdk-overlay, .navcluster, .toast-host')) return;
    e.preventDefault();
    if (!selected()) { if (S.placed[0]) S.selectedId = S.placed[0].id; else return; }
    S.inspectorOpen = true;
    const mw = 200, mh = 330, pad = 8;
    S.ctx = { x: Math.min(e.clientX, window.innerWidth - mw - pad), y: Math.min(e.clientY, window.innerHeight - mh - pad) };
    render();
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'catSearch') { S.query = e.target.value.trim(); S.page = 0;
      updateCatalog();  // partial — no full-stage churn, keeps focus + caret
      return;
    }
    if (e.target.id === 'cmdkInput') {
      S.cmdQuery = e.target.value; S.cmdIdx = 0;
      updateCmdkResults();  // partial update — keeps overlay/input alive, no animation replay
      return;
    }
    if (e.target.hasAttribute('data-tf')) {
      const it = selected(); if (it) { const k = e.target.dataset.tf; const v = parseFloat(e.target.value); if (!isNaN(v)) it[k] = v; }
      return;
    }
    if (e.target.hasAttribute('data-sheen')) {
      const it = selected(); if (it) it.sheen = Number(e.target.value);
      const erlbl = e.target.closest('.er-field') ? e.target.closest('.er-field').querySelector('.er-fhead .mono') : null;
      if (erlbl) erlbl.textContent = Number(e.target.value) + '%';
      else { const row = e.target.previousElementSibling; const lbl = row && row.querySelector ? row.querySelector('.mono') : null; if (lbl) lbl.textContent = Number(e.target.value) + '%'; }
    }
  });

  // ---- init ----
  // first-run onboarding: forced with ?onboard=1, suppressed once dismissed
  let seen = false;
  try { seen = localStorage.getItem('hdb_onboarded') === '1'; } catch (e) {}
  if (params.get('onboard') === '1') S.onboard = true;
  else if (params.get('onboard') === '0') S.onboard = false;
  else S.onboard = !embed && !seen;

  // react to system theme changes while in Auto mode
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (S.modePref === 'auto') { applyTheme(); if (S.appearanceOpen) render(); }
    });
  }

  // on phones, start with the catalog collapsed so the scene is visible;
  // the inspector demos the selected item as a bottom sheet.
  if (isMobile()) S.catalogOpen = false;

  // re-render when crossing the mobile breakpoint so chrome swaps cleanly
  let wasMobile = isMobile();
  let rzT;
  window.addEventListener('resize', () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      const m = isMobile();
      if (m !== wasMobile) {
        wasMobile = m;
        if (!m) { S.mobileMenuOpen = false; }
        else { S.openMenu = null; }
        render();
      }
    }, 150);
  });

  render();
  applyTheme();

  // ---- loading sequence ----
  if (S.loading) {
    const TIPS = ['Loading flat geometry…', 'Placing walls & windows…', 'Importing furniture catalogue…', 'Warming up the renderer…', 'Ready.'];
    S.loadPct = 0;
    let step = 0;
    const tick = () => {
      step++;
      S.loadPct = Math.min(100, Math.round((step / 9) * 100));
      const bar = document.querySelector('#loading .load-bar i');
      const pct = document.getElementById('loadPct');
      const tip = document.getElementById('loadTip');
      if (bar) bar.style.width = S.loadPct + '%';
      if (pct) pct.textContent = S.loadPct + '%';
      if (tip) tip.textContent = TIPS[Math.min(TIPS.length - 1, Math.floor(step / 2))];
      if (S.loadPct >= 100) {
        clearInterval(iv);
        setTimeout(() => { const o = document.getElementById('loading'); if (o) { o.style.transition = 'opacity 0.4s'; o.style.opacity = '0'; } setTimeout(() => { S.loading = false; render(); }, 420); }, 350);
      }
    };
    const iv = setInterval(tick, 210);
  }
})();

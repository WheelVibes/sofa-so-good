/* ============================================================
   HDB Sandbox — Line icon set (stroke, 24px, round caps)
   ICONS[name] = inner SVG markup.  icon(name, size) -> <svg> string.
   ============================================================ */
const ICONS = {
  // chrome
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12l4.5 4.5L19 7"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  drag: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',

  // history / file
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/>',
  redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  folder: '<path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/>',
  file: '<path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/>',

  // views & tools
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 3v18M4 7.5l8 4.5 8-4.5"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/>',
  walk: '<circle cx="12" cy="4.5" r="1.8"/><path d="M12 7v6M12 9l-4 2M12 9l4 1.5M9 21l1.5-5M15 20l-1.5-4.5"/>',
  ruler: '<rect x="3" y="8" width="18" height="8" rx="1"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  topView: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 10h16M10 4v16"/>',
  home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
  tidy: '<path d="M5 7l1.5 3L10 11.5 6.5 13 5 16.5 3.5 13 0.5 11.5 3.5 10z" transform="translate(3 -1)"/><path d="M16 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z"/>',
  turntable: '<path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M3 13l3.5 4.8L11 16"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  wrench: '<path d="M15 7a4 4 0 0 0-5 5l-6 6 2 2 6-6a4 4 0 0 0 5-5l-2.5 2.5-2-2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  budget: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .8-1 1.7"/><circle cx="12" cy="17" r="0.6"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9h16M4 14h16M9 4v16M14 4v16"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-1.5-.5-2.5S14 13 16 13h2a3 3 0 0 0 3-3c0-4-4-7-9-7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',

  // item actions
  rotate: '<path d="M20 11a8 8 0 1 0-2 6"/><path d="M21 5v5h-5"/>',
  flipH: '<path d="M12 3v18"/><path d="M8 7L4 12l4 5z"/><path d="M16 7l4 5-4 5z"/>',
  flipV: '<path d="M3 12h18"/><path d="M7 8l5-4 5 4z"/><path d="M7 16l5 4 5-4z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  group: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  alignX: '<path d="M12 3v18"/><rect x="6" y="6" width="5" height="4" rx="1"/><rect x="13" y="14" width="5" height="4" rx="1"/>',
  alignZ: '<path d="M3 12h18"/><rect x="6" y="6" width="4" height="5" rx="1"/><rect x="14" y="13" width="4" height="5" rx="1"/>',
  distribute: '<path d="M3 4v16M21 4v16"/><rect x="9" y="9" width="6" height="6" rx="1"/>',

  // categories
  catSeating: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M4 11h16v5H4zM6 16v3M18 16v3"/>',
  catBed: '<path d="M3 17V8M3 12h13a4 4 0 0 1 4 4v1M3 17h18M19 17v2M3 19v-2"/><path d="M6 12V9h6v3"/>',
  catTable: '<path d="M3 9h18M5 9v11M19 9v11M8 9V6h8v3"/>',
  catStorage: '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M12 3v18M9 8h0.5M14.5 8h0.5"/>',
  catKitchen: '<path d="M9 3v6a2 2 0 0 1-4 0V3M7 3v18M15 3c-1.5 0-2 2-2 4s.5 4 2 4M15 3v18"/>',
  catBath: '<path d="M5 11V6a2 2 0 0 1 4 0M4 11h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/>',
  catLighting: '<path d="M9 14a5 5 0 1 1 6 0c-.7.5-1 1.2-1 2H10c0-.8-.3-1.5-1-2z"/><path d="M10 19h4M10.5 21h3"/>',
  catDecor: '<path d="M12 4c2 3 4 4.5 4 8a4 4 0 0 1-8 0c0-3.5 2-5 4-8z"/>',
  catPlant: '<path d="M12 21v-9M12 12c-3 0-5-2-5-5 3 0 5 2 5 5zM12 12c0-3 2-5 5-5 0 3-2 5-5 5z"/><path d="M9 21h6"/>',
  catAppliance: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 8h14"/><circle cx="12" cy="14" r="3"/>',
  catTextile: '<path d="M4 5h16v4c-2 0-2 2-4 2s-2-2-4-2-2 2-4 2-2-2-2-2zM4 9v10h16V9"/>',
  catElectronics: '<rect x="3" y="5" width="18" height="11" rx="1"/><path d="M8 20h8M12 16v4"/>',
  catKids: '<circle cx="12" cy="7" r="3"/><path d="M6 21c0-3.5 2.5-6 6-6s6 2.5 6 6"/>',
  catOutdoor: '<path d="M12 3v3M5.5 5.5l2 2M18.5 5.5l-2 2"/><path d="M7 13a5 5 0 0 1 10 0zM5 13h14M11 13v8M13 13v8"/>',
  catOther: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',

  // misc
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  compassN: '<path d="M12 2l3 10-3 2-3-2z"/>',
  upload: '<path d="M12 16V5M8 9l4-4 4 4"/><path d="M5 19h14"/>',
  star: '<path d="M12 4l2.4 5 5.6.5-4.2 3.7 1.3 5.5L12 16l-5.1 2.7 1.3-5.5L4 9.5 9.6 9z"/>',
  fps: '<path d="M4 18V6M4 14l4-3 4 4 8-7"/>',
  pin: '<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z"/><circle cx="12" cy="11" r="2"/>',
};

function icon(name, size = 18, stroke = 1.75) {
  const inner = ICONS[name] || ICONS.catOther;
  return `<svg class="icn" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

if (typeof window !== 'undefined') { window.ICONS = ICONS; window.icon = icon; }

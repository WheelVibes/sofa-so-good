import { defineConfig } from 'vitepress'

// Developer guide for Sofa So Good. Unlike the user guide (docs/user/), this
// site is **never deployed** — it's a local-only convenience so maintainers can
// read the architecture docs with VitePress's nav/search/dark-mode instead of
// raw Markdown. Run it with `npm run docs:dev:developer` (port 5176). No `base`
// or `outDir` overrides: it builds to the default `.vitepress/dist` and is
// gitignored, so it can never leak into the app's `dist/`.
export default defineConfig({
  title: 'Sofa So Good — Developer',
  description: 'Architecture, systems, and how-to recipes for maintaining Sofa So Good.',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Overview', link: '/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Adding features', link: '/adding-features' },
    ],
    sidebar: [
      {
        text: 'Developer guide',
        items: [{ text: 'Overview', link: '/' }],
      },
      {
        text: 'Architecture & systems',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'State management', link: '/state-management' },
          { text: 'Rendering & scene', link: '/rendering-and-scene' },
          { text: 'Furniture catalog', link: '/furniture-catalog' },
          { text: 'Materials & finishes', link: '/materials-and-finishes' },
          { text: 'Import pipeline', link: '/import-pipeline' },
          { text: 'Apartment & floor plan', link: '/apartment-and-floorplan' },
          { text: 'UI & design system', link: '/ui-and-design-system' },
          { text: 'Packs & remote catalog', link: '/packs-and-remote-catalog' },
        ],
      },
      {
        text: 'Working in the repo',
        items: [
          { text: 'Testing & verification', link: '/testing-and-verification' },
          { text: 'Offline tooling', link: '/offline-tooling' },
          { text: 'Adding features', link: '/adding-features' },
        ],
      },
    ],
    outline: { level: [2, 3] },
    search: { provider: 'local' },
  },
})

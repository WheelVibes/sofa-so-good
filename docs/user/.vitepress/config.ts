import { defineConfig } from 'vitepress'

// User guide for Sofa So Good. Built into the app's dist/docs so it deploys at
// https://<pages-host>/sofa-so-good/docs/. base MUST match that sub-path.
export default defineConfig({
  title: 'Sofa So Good',
  description: 'User guide — furnish, finish, and walk through your HDB or condo home in 3D.',
  base: '/sofa-so-good/docs/',
  // Written relative to the VitePress root (docs/user). Lands in the repo's
  // dist/docs so `build:all` deploys it alongside the app. VitePress only
  // empties its own outDir, so this is safe to point inside dist.
  outDir: '../../dist/docs',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Open the app', link: 'https://github.com/' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Welcome', link: '/' },
          { text: 'Quick start', link: '/getting-started' },
          { text: 'Navigating the flat', link: '/navigating' },
        ],
      },
      {
        text: 'Designing',
        items: [
          { text: 'Placing & arranging furniture', link: '/placing-furniture' },
          { text: 'Pet fittings & furniture', link: '/pet-fittings' },
          { text: 'Finishes & materials', link: '/finishes-and-materials' },
          { text: 'Lighting & time of day', link: '/lighting-and-time' },
          { text: 'Themes & appearance', link: '/themes-and-appearance' },
        ],
      },
      {
        text: 'Bringing your own content',
        items: [
          { text: 'Importing models', link: '/importing-models' },
          { text: 'Importing textures', link: '/importing-textures' },
        ],
      },
      {
        text: 'Planning tools',
        items: [
          { text: 'Floor-plan editor', link: '/floor-plan-editor' },
          { text: 'Per-room editor', link: '/room-editor' },
          { text: 'Walkthrough & sun study', link: '/walkthrough-and-sun-study' },
          { text: 'Budget, checks & report', link: '/design-tools' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Keyboard shortcuts', link: '/keyboard-shortcuts' },
          { text: 'Tips & FAQ', link: '/tips-and-faq' },
        ],
      },
    ],
    outline: { level: [2, 3] },
    search: { provider: 'local' },
  },
})

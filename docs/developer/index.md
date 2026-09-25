# Developer guide

Maintainer-facing documentation for Sofa So Good. These pages are **not
deployed** — the deployed user guide lives in `docs/user/` and ships at
`/sofa-so-good/docs/`.

Start with [Architecture](./architecture.md), then dive into the system you're
touching. `CLAUDE.md` at the repo root is the terse, always-current architecture
index; these guides expand on it with rationale and how-to recipes. Design
history lives under `docs/superpowers/specs/`.

## Guides
- [Architecture](./architecture.md)
- [State management](./state-management.md)
- [Rendering & scene](./rendering-and-scene.md)
- [Furniture catalog](./furniture-catalog.md)
- [Materials & finishes](./materials-and-finishes.md)
- [KTX2 / Basis textures](./ktx2-textures.md)
- [Import pipeline](./import-pipeline.md)
- [Apartment & floor plan](./apartment-and-floorplan.md)
- [UI & design system](./ui-and-design-system.md)
- [Packs & remote catalog](./packs-and-remote-catalog.md)
- [Showroom (view-only) share links](./showroom-links.md)
- [PWA install CTA + iOS coachmark](./pwa-install.md)
- [Testing & verification](./testing-and-verification.md)
- [Offline tooling](./offline-tooling.md)
- [Adding features](./adding-features.md)

## Audits & research

The living index is **[the standing review log](../audit/review-log.md)** — one entry per review
pass, newest first, linking out to the full write-up for each area. Round 7's own docs:

- [SOTA research sweep, real-time web archviz (2026-09-25)](../research/sota-2026-09-25.md)
- [Product & UX gap analysis (2026-09-25)](../audit/product-ux-2026-09-25.md)
- [Visual verification — round 7's four UI features (2026-09-25)](../audit/visual-verify-r7-2026-09-25.md)
- [Perf trace — P1 attributed by CDP trace (2026-09-25)](../audit/perf-trace-2026-09-25.md)

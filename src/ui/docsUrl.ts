// The deployed user guide lives at <app base>/docs/. import.meta.env.BASE_URL
// is '/sofa-so-good/' in production and '/' in dev, so this resolves to
// '/sofa-so-good/docs/' on Pages without hardcoding the host or project path.
export const DOCS_URL = `${import.meta.env.BASE_URL}docs/`

/** Open the user guide in a new tab. */
export function openDocs() {
  window.open(DOCS_URL, '_blank', 'noopener,noreferrer')
}

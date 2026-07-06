import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProfilerApp } from './ProfilerApp'

let win: Window | null = null
let root: Root | null = null

/** Copy the parent's stylesheets + theme attributes into the child document so
 *  token classes resolve. Cloned styles do NOT hot-reload (dev-tool limitation). */
function cloneStyles(doc: Document): void {
  for (const node of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
    doc.head.appendChild(node.cloneNode(true))
  }
  // Mirror theme + light/dark class/attributes from the parent <html>.
  const src = document.documentElement
  doc.documentElement.className = src.className
  for (const attr of Array.from(src.attributes)) {
    if (attr.name.startsWith('data-')) doc.documentElement.setAttribute(attr.name, attr.value)
  }
  doc.body.className = document.body.className
}

/**
 * Open (or focus) the detached profiler window and mount a separate React root
 * into it. Dev-only — callers guard with `import.meta.env.DEV`.
 */
export function openProfilerWindow(): void {
  if (win && !win.closed) {
    win.focus()
    return
  }
  const w = window.open('', 'sofa-profiler', 'width=460,height=760')
  if (!w) {
    // eslint-disable-next-line no-console
    console.warn('[profiler] popup blocked — allow popups for this origin')
    return
  }
  win = w
  w.document.title = 'Sofa Profiler'
  cloneStyles(w.document)
  const mount = w.document.createElement('div')
  mount.className = 'profiler-root'
  w.document.body.appendChild(mount)
  root = createRoot(mount)
  root.render(createElement(ProfilerApp))

  const cleanup = () => {
    root?.unmount()
    root = null
    win = null
  }
  w.addEventListener('beforeunload', cleanup)
  // Close the child if the parent unloads so it never orphans.
  window.addEventListener('beforeunload', () => {
    if (win && !win.closed) win.close()
  })
}

import type { ReactNode, SVGProps } from 'react'

/** Shared 20px stroked-SVG wrapper. Pass raw children (paths/shapes). */
function Svg({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={20}
      height={20}
      {...p}
    >
      {children}
    </svg>
  )
}

/** Toolbar icon set. Paths mirror the approved mockup (`/tmp/mock/build.mjs`). */
export const Icon = {
  Orbit: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2a10 10 0 0 1 0 20" />
      <path d="M12 2a10 10 0 0 0 0 20" />
    </Svg>
  ),
  Walk: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="13" cy="4" r="1.6" />
      <path d="M11 7l-1.5 4 2.5 2v6" />
      <path d="M11 13l-2.5 1.5" />
      <path d="M13 9l3 1.5" />
    </Svg>
  ),
  Time: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  Sun: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
    </Svg>
  ),
  Lights: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 1 4 10c-.7.7-1 1.5-1 2H9c0-.5-.3-1.3-1-2A6 6 0 0 1 12 3z" />
    </Svg>
  ),
  Measure: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 8h18v8H3z" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </Svg>
  ),
  Quality: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" />
    </Svg>
  ),
  TopView: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M9 3v18" />
    </Svg>
  ),
  Reset: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Svg>
  ),
  Turntable: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M5 19h14" />
      <ellipse cx="12" cy="11" rx="7" ry="3" />
      <path d="M12 8V5" />
    </Svg>
  ),
  Rotate: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 1 3 6.7" />
      <path d="M3 17v-5h5" />
    </Svg>
  ),
  Select: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 4l7 16 2-7 7-2z" />
    </Svg>
  ),
  Undo: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M9 7L4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 0 10h-1" />
    </Svg>
  ),
  Redo: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M15 7l5 5-5 5" />
      <path d="M20 12H9a5 5 0 0 0 0 10h1" />
    </Svg>
  ),
  Snap: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </Svg>
  ),
  Catalog: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </Svg>
  ),
  Sets: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="3" y="10" width="8" height="8" />
      <rect x="9" y="5" width="8" height="8" />
    </Svg>
  ),
  FloorPlan: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 3h18v18H3z" />
      <path d="M3 10h7V3M14 21v-7h7" />
    </Svg>
  ),
  Presets: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Svg>
  ),
  Tidy: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M5 12l3 3 6-7" />
      <path d="M14 5l2 2 4-5" opacity=".5" />
    </Svg>
  ),
  Style: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-1 1-2-.4-1 .2-2 1.3-2H17a4 4 0 0 0 4-4c0-5-4-8-9-8z" />
      <circle cx="7.5" cy="10.5" r="1" />
      <circle cx="12" cy="7.5" r="1" />
      <circle cx="16.5" cy="10.5" r="1" />
    </Svg>
  ),
  Tools: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M14 7a3.5 3.5 0 0 1-4.6 4.6L4 17l3 3 5.4-5.4A3.5 3.5 0 0 1 17 10l-3-3z" />
    </Svg>
  ),
  Save: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M5 3h12l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <rect x="8" y="13" width="8" height="5" />
    </Svg>
  ),
  Load: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  ),
  Export: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  ),
  Record: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="6" />
    </Svg>
  ),
  Credits: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" />
    </Svg>
  ),
  Budget: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M14.5 9.2c-.4-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.8 0 2.4 5 1.3 5 3.6 0 1.1-1.1 1.8-2.5 1.8-1.1 0-2.1-.4-2.5-1.2" />
    </Svg>
  ),
  Checks: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3l7 3v6c0 4-3 6.5-7 9-4-2.5-7-5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  SunStudy: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 18h16" />
      <path d="M7 18a5 5 0 0 1 10 0" />
      <path d="M12 5V3M5.5 8L4 6.5M18.5 8L20 6.5" />
    </Svg>
  ),
  Walkthrough: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M8 5v14l11-7z" />
    </Svg>
  ),
  Report: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4" />
      <path d="M9 13h6M9 17h6" />
    </Svg>
  ),
  Chevron: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  ),
  ExitRoom: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M10 19l-7-7 7-7" />
      <path d="M3 12h18" />
    </Svg>
  ),
  // ── Design-system additions ──────────────────────────────────────────
  Palette: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-.5-1.5-.5-2.5S14 13 16 13h2a3 3 0 0 0 3-3c0-4-4-7-9-7z" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Help: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .8-1 1.7" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Search: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Svg>
  ),
  Layers: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13l9 5 9-5" />
    </Svg>
  ),
  Heart: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 20s-7-4.6-9.2-9C1.3 7.6 3 4.5 6.2 4.5c2 0 3.2 1.2 3.8 2.3.6-1.1 1.8-2.3 3.8-2.3 3.2 0 4.9 3.1 3.4 6.5C19 15.4 12 20 12 20z" />
    </Svg>
  ),
  Star: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.77 6.8 19.5l.99-5.78-4.21-4.1 5.82-.85z" />
    </Svg>
  ),
  Share: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" />
    </Svg>
  ),
  Versions: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4l3 2" />
    </Svg>
  ),
  Lock: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
  Unlock: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </Svg>
  ),
  Eye: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </Svg>
  ),
  EyeOff: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 4l16 16" />
      <path d="M9.5 5.6A10 10 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a16 16 0 0 1-3.2 3.8" />
      <path d="M6.2 7.8A16 16 0 0 0 2 12s3.5 6.5 10 6.5a10 10 0 0 0 3.3-.55" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Svg>
  ),
  Trash: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" />
    </Svg>
  ),
  Copy: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </Svg>
  ),
  Plus: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Minus: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M5 12h14" />
    </Svg>
  ),
  Close: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  ),
  Check: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M5 12l4.5 4.5L19 7" />
    </Svg>
  ),
  Home: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </Svg>
  ),
  Moon: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
    </Svg>
  ),
  Settings: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </Svg>
  ),
  FlipH: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3v18" />
      <path d="M8 7L4 12l4 5z" />
      <path d="M16 7l4 5-4 5z" />
    </Svg>
  ),
  FlipV: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 12h18" />
      <path d="M7 8l5-4 5 4z" />
      <path d="M7 16l5 4 5-4z" />
    </Svg>
  ),
  Group: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  AlignX: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3v18" />
      <rect x="6" y="6" width="5" height="4" rx="1" />
      <rect x="13" y="14" width="5" height="4" rx="1" />
    </Svg>
  ),
  AlignZ: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 12h18" />
      <rect x="6" y="6" width="4" height="5" rx="1" />
      <rect x="14" y="13" width="4" height="5" rx="1" />
    </Svg>
  ),
  Distribute: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M3 4v16M21 4v16" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </Svg>
  ),
  Pin: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z" />
      <circle cx="12" cy="11" r="2" />
    </Svg>
  ),
  Drag: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  ),
  Cube: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 3v18M4 7.5l8 4.5 8-4.5" />
    </Svg>
  ),
  Upload: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 16V5M8 9l4-4 4 4" />
      <path d="M5 19h14" />
    </Svg>
  ),
  More: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  ),
  ArrowLeft: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  ),
  ChevronRight: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  ),
  Download: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </Svg>
  ),
  Menu: (p: SVGProps<SVGSVGElement>) => (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),
} as const

export type IconName = keyof typeof Icon

import type { SVGProps } from 'react'

/** Sofa So Good brand mark — the roof + sofa silhouette from the favicon,
 *  drawn monochrome in `currentColor` so it sits cleanly inside the accent
 *  brand chip (toolbar / loading / onboarding). */
export function BrandMark({ size = 22, ...p }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      {...p}
    >
      {/* roof */}
      <path
        d="M5 14 16 6l11 8"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* sofa back + seat */}
      <rect x="7" y="16.5" width="18" height="7.5" rx="1.6" />
      {/* legs */}
      <rect x="6" y="20" width="3" height="5" rx="1" />
      <rect x="23" y="20" width="3" height="5" rx="1" />
    </svg>
  )
}

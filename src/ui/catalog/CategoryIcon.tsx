import type { CSSProperties } from 'react'
import type { FurnitureCategory } from '../../furniture/types'

interface CategoryIconProps {
  category: FurnitureCategory
  className?: string
  width?: number
  height?: number
  style?: CSSProperties
}

/** Tiny top-down SVG glyph per category. Uses currentColor so the parent
 *  controls hue. Drawn on a 16×16 viewBox; defaults to 16px square. */
export function CategoryIcon({
  category,
  className,
  width = 16,
  height = 16,
  style,
}: CategoryIconProps) {
  const common = {
    viewBox: '0 0 16 16',
    width,
    height,
    className,
    style,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (category) {
    case 'beds':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.2" />
          <rect x="3.75" y="4.25" width="8.5" height="2.25" rx="0.5" />
        </svg>
      )
    case 'seating':
      return (
        <svg {...common}>
          <rect x="2" y="5" width="12" height="7" rx="1.5" />
          <path d="M2 8.5h12" />
          <path d="M5.5 8.5v3.5M10.5 8.5v3.5" />
        </svg>
      )
    case 'tables':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.25" />
          <circle cx="8" cy="8" r="1.25" />
        </svg>
      )
    case 'storage':
      return (
        <svg {...common}>
          <rect x="3.5" y="2.5" width="9" height="11" rx="0.75" />
          <path d="M3.5 6.25h9M3.5 9.75h9" />
        </svg>
      )
    case 'kitchen':
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="11" height="8" rx="0.75" />
          <circle cx="5.5" cy="8" r="1.1" />
          <circle cx="10.5" cy="8" r="1.1" />
        </svg>
      )
    case 'lighting':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5M4.1 4.1l1.05 1.05M10.85 10.85l1.05 1.05M11.9 4.1l-1.05 1.05M5.15 10.85L4.1 11.9" />
        </svg>
      )
    case 'bathroom':
      return (
        <svg {...common}>
          <path d="M3 8h10v1.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
          <path d="M5 8V4.5a1.5 1.5 0 0 1 3 0" />
        </svg>
      )
    case 'appliances':
      return (
        <svg {...common}>
          <rect x="4" y="2.5" width="8" height="11" rx="0.75" />
          <path d="M4 6.5h8" />
          <path d="M6 4.2v0.6M6 8.4v2.4" />
        </svg>
      )
    case 'decor':
      return (
        <svg {...common}>
          <path d="M8 2.5l1.7 3.45 3.8.55-2.75 2.68.65 3.78L8 11.18l-3.4 1.78.65-3.78L2.5 6.5l3.8-.55z" />
        </svg>
      )
    case 'textiles':
      return (
        <svg {...common}>
          <ellipse cx="8" cy="8" rx="5.5" ry="3" />
          <ellipse cx="8" cy="8" rx="3" ry="1.5" />
          <path d="M2.5 8h11" />
        </svg>
      )
    case 'outdoor':
      return (
        <svg {...common}>
          <path d="M8 13.5V8" />
          <path d="M8 8C8 8 4 7 4 4.5a4 4 0 0 1 8 0C12 7 8 8 8 8z" />
          <path d="M5.5 13.5h5" />
        </svg>
      )
    case 'electronics':
      return (
        <svg {...common}>
          <rect x="2.5" y="3.5" width="11" height="7.5" rx="0.75" />
          <path d="M6 13h4" />
          <path d="M8 11v2" />
        </svg>
      )
    case 'kids':
      return (
        <svg {...common}>
          <circle cx="8" cy="5" r="2.25" />
          <path d="M4 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
        </svg>
      )
    case 'laundry':
      return (
        <svg {...common}>
          <rect x="3.5" y="2.75" width="9" height="10.5" rx="1" />
          <circle cx="8" cy="8.5" r="2.75" />
          <path d="M5.5 4.5h0.01M7.5 4.5h0.01" />
        </svg>
      )
    case 'others':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="10" height="10" rx="1" strokeDasharray="2 1.5" />
          <circle cx="6" cy="8" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="8" cy="8" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="10" cy="8" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}

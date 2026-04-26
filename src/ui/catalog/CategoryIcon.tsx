import type { FurnitureCategory } from '../../furniture/types';

interface CategoryIconProps {
  category: FurnitureCategory;
  className?: string;
}

/** Tiny top-down SVG glyph per category. Uses currentColor so the parent
 *  controls hue via Tailwind text-* classes. Drawn on a 16×16 viewBox. */
export function CategoryIcon({ category, className }: CategoryIconProps) {
  const common = {
    viewBox: '0 0 16 16',
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (category) {
    case 'beds':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.2" />
          <rect x="3.75" y="4.25" width="8.5" height="2.25" rx="0.5" />
        </svg>
      );
    case 'seating':
      return (
        <svg {...common}>
          <rect x="2" y="5" width="12" height="7" rx="1.5" />
          <path d="M2 8.5h12" />
          <path d="M5.5 8.5v3.5M10.5 8.5v3.5" />
        </svg>
      );
    case 'tables':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="5.25" />
          <circle cx="8" cy="8" r="1.25" />
        </svg>
      );
    case 'storage':
      return (
        <svg {...common}>
          <rect x="3.5" y="2.5" width="9" height="11" rx="0.75" />
          <path d="M3.5 6.25h9M3.5 9.75h9" />
        </svg>
      );
    case 'kitchen':
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="11" height="8" rx="0.75" />
          <circle cx="5.5" cy="8" r="1.1" />
          <circle cx="10.5" cy="8" r="1.1" />
        </svg>
      );
    case 'lighting':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5M4.1 4.1l1.05 1.05M10.85 10.85l1.05 1.05M11.9 4.1l-1.05 1.05M5.15 10.85L4.1 11.9" />
        </svg>
      );
    case 'decor':
      return (
        <svg {...common}>
          <path d="M8 2.5l1.7 3.45 3.8.55-2.75 2.68.65 3.78L8 11.18l-3.4 1.78.65-3.78L2.5 6.5l3.8-.55z" />
        </svg>
      );
  }
}

import { Icon, type IconName } from './icons';
import { Tooltip } from './Tooltip';

interface IconButtonProps {
  icon: IconName;
  label: string;
  shortcut?: string;
  active?: boolean;
  chevron?: boolean;
  badge?: string | number;
  onClick?: () => void;
}

/** A single icon control with a hover tooltip. Active state mirrors the
 *  dark-pill highlight; optional chevron marks a dropdown; optional badge is a
 *  small rose count dot. */
export function IconButton({ icon, label, shortcut = '', active, chevron, badge, onClick }: IconButtonProps) {
  const Cmp = Icon[icon];
  const hasBadge = badge != null && badge !== '' && badge !== 0;
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`relative flex h-9 items-center gap-1 rounded-lg px-2.5 ${
          active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/80'
        }`}
      >
        <Cmp />
        {chevron ? <Icon.Chevron width={12} height={12} className="opacity-60" /> : null}
        {hasBadge ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {badge}
          </span>
        ) : null}
      </button>
    </Tooltip>
  );
}

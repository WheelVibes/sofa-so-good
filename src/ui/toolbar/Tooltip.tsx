import { useRef, useState, type ReactNode } from 'react';
import { Popover } from './Popover';

const DELAY_MS = 400;

/** Wraps a trigger; shows a portaled dark tooltip (label + optional shortcut
 *  chip) after a hover delay. Hidden on leave / pointer-down. */
export function Tooltip({ label, shortcut, children }: { label: string; shortcut: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const enter = () => {
    timer.current = setTimeout(() => setOpen(true), DELAY_MS);
  };
  const leave = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      ref={ref}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerDown={leave}
      className="inline-flex"
    >
      {children}
      <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)} align="center">
        <div className="flex items-center whitespace-nowrap rounded-md bg-neutral-800 px-2 py-1 text-xs text-white shadow-lg">
          {label}
          {shortcut ? (
            <span
              data-testid="tooltip-chip"
              className="ml-2 rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300"
            >
              {shortcut}
            </span>
          ) : null}
        </div>
      </Popover>
    </span>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RiArrowDownSLine, RiCheckLine } from '@remixicon/react';
import { cx } from '../../utils/cx';

/**
 * Animated dropdown (21st.dev "dropdown-menu", adapted): a dark glass
 * trigger and panel; items come in one after the other out of a blur.
 *
 * Adapted to the portal: the trigger is a plain button (the app's own
 * `Button` is BoardUI's, not shadcn's), it can open upwards for bars pinned
 * to the bottom, and it closes on pick, outside click and Escape. Arrow keys
 * move between items.
 */

export type DropdownOption = {
  label: string;
  onClick: () => void;
  Icon?: React.ReactNode;
  /** Shown with a check mark (e.g. the current category). */
  active?: boolean;
  disabled?: boolean;
};

type DropdownMenuProps = {
  options: DropdownOption[];
  children: React.ReactNode;
  /** Opens above the trigger (for bars at the bottom of the screen). */
  placement?: 'bottom' | 'top';
  align?: 'start' | 'end';
  /** Heading shown at the top of the panel. */
  title?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
};

const spring = { type: 'spring' as const, duration: 0.45, bounce: 0.25 };

const DropdownMenu = ({
  options,
  children,
  placement = 'bottom',
  align = 'start',
  title,
  disabled,
  className,
  triggerClassName,
  menuClassName,
}: DropdownMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const up = placement === 'top';

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setIsOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [isOpen]);

  const focusItem = (dir: 1 | -1) => {
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + dir + items.length) % items.length].focus();
  };

  return (
    <div ref={root} className={cx('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setIsOpen(true);
            requestAnimationFrame(() => focusItem(e.key === 'ArrowDown' ? 1 : -1));
          }
        }}
        className={cx(
          'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border-none px-4 text-body-2-medium text-white outline-none',
          'bg-[#11111198] shadow-[0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-sm transition-colors hover:bg-[#111111d1]',
          'focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-40',
          triggerClassName,
        )}
      >
        {children ?? 'Menu'}
        <motion.span className="ml-0.5 inline-flex" animate={{ rotate: isOpen !== up ? 180 : 0 }} transition={spring}>
          <RiArrowDownSLine className="size-4" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            onKeyDown={e => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                focusItem(e.key === 'ArrowDown' ? 1 : -1);
              }
            }}
            initial={{ y: up ? 5 : -5, scale: 0.95, opacity: 0, filter: 'blur(10px)' }}
            animate={{ y: 0, scale: 1, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: up ? 5 : -5, scale: 0.95, opacity: 0, filter: 'blur(10px)' }}
            transition={spring}
            style={{ transformOrigin: `${up ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}` }}
            className={cx(
              'absolute z-50 flex max-h-80 w-56 flex-col gap-1 overflow-y-auto rounded-xl p-1',
              'bg-[#111111e6] shadow-[0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-md',
              up ? 'bottom-full mb-2' : 'top-full mt-2',
              align === 'end' ? 'right-0' : 'left-0',
              menuClassName,
            )}
          >
            {title && <p className="px-2 pt-1.5 pb-0.5 text-caption-1-medium tracking-[0.08em] text-white/45 uppercase">{title}</p>}
            {options.length > 0 ? (
              options.map((option, index) => (
                <motion.button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  disabled={option.disabled}
                  initial={{ opacity: 0, x: 10, scale: 0.95, filter: 'blur(10px)' }}
                  animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, x: 10, scale: 0.95, filter: 'blur(10px)' }}
                  transition={{ ...spring, delay: Math.min(index, 8) * 0.05 }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.08)', transition: { duration: 0.3 } }}
                  whileTap={{ scale: 0.96, transition: { duration: 0.15 } }}
                  onClick={() => {
                    setIsOpen(false);
                    option.onClick();
                  }}
                  className={cx(
                    'flex w-full cursor-pointer items-center gap-x-2 rounded-lg px-2 py-2.5 text-left text-body-2-regular text-white outline-none',
                    'focus-visible:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  {option.Icon && <span className="grid size-4 shrink-0 place-items-center">{option.Icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.active && <RiCheckLine className="size-4 shrink-0 text-white/60" aria-hidden />}
                </motion.button>
              ))
            ) : (
              <div className="px-4 py-2 text-caption-1-regular text-white/60">Aucune option</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { DropdownMenu };

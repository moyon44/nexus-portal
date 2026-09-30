import type React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { RiComputerLine, RiMoonLine, RiSunLine } from '@remixicon/react';
import { useDashboard } from '../../store';
import { applyTheme } from '../../theme/theme';
import type { ThemeConfig } from '../../types';
import { cx } from '../../utils/cx';
import { themeReveal } from '../../lib/motion';

const MODES: { key: ThemeConfig['mode']; label: string; icon: typeof RiSunLine }[] = [
  { key: 'light', label: 'Clair', icon: RiSunLine },
  { key: 'dark', label: 'Sombre', icon: RiMoonLine },
  { key: 'auto', label: 'Système', icon: RiComputerLine },
];

/**
 * Pill toggle from the Jellydash sidebar: a round thumb slides behind the
 * chosen mode. The mode applies at once, then persists to the backend.
 */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { data, updateTheme } = useDashboard();
  const [mode, setMode] = useState(data.theme.mode);
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => setMode(data.theme.mode), [data.theme.mode]);

  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el) setThumb({ left: el.offsetLeft, top: el.offsetTop });
  }, [mode, collapsed]);

  // The new theme spreads from the button in a growing circle.
  const choose = (next: ThemeConfig['mode'], e?: React.MouseEvent) => {
    const r = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    themeReveal(r ? r.left + r.width / 2 : window.innerWidth / 2, r ? r.top + r.height / 2 : 0, () => {
      setMode(next);
      applyTheme({ mode: next, primaryColor: data.theme.primaryColor, skin: data.theme.skin });
      updateTheme({ mode: next }).catch(() => undefined);
    });
  };

  const shown = collapsed ? MODES.filter((m) => m.key === mode) : MODES;

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label="Thème"
      className="relative inline-flex w-fit items-center gap-1 rounded-full bg-theme-toggle-sidebar-background p-1"
    >
      {thumb && !collapsed && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 size-8 rounded-full bg-theme-toggle-sidebar-selected-background shadow-2xs transition-transform duration-200 ease-out"
          style={{ transform: `translate(${thumb.left}px, ${thumb.top}px)` }}
        />
      )}
      {shown.map(({ key, label, icon: Icon }) => {
        const selected = key === mode;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={(e) => {
              if (collapsed) {
                const i = MODES.findIndex((m) => m.key === mode);
                choose(MODES[(i + 1) % MODES.length].key, e);
              } else {
                choose(key, e);
              }
            }}
            className={cx(
              'relative z-10 grid size-8 cursor-pointer place-items-center rounded-full outline-none',
              'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
              selected ? 'text-foreground-icon-primary' : 'text-foreground-icon-secondary hover:text-foreground-icon-primary',
              collapsed && 'bg-theme-toggle-sidebar-selected-background',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

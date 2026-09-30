import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

/** Small numeric counter pill (Jellydash components/base/badges/badge). */
export function Badge({
  color = 'neutral',
  className,
  children,
}: {
  color?: 'primary' | 'neutral';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center rounded-sm px-1 py-px text-caption-1-semibold tracking-normal whitespace-nowrap',
        color === 'primary' ? 'bg-accent-400 text-white' : 'bg-badge-neutral-background text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}

export type ChipTone = 'neutral' | 'lime' | 'yellow' | 'rose' | 'cyan' | 'blue' | 'purple';

const CHIP: Record<ChipTone, string> = {
  neutral: 'bg-background-tertiary-default text-text-secondary',
  lime: 'bg-status-lime-background text-status-lime-text',
  yellow: 'bg-status-yellow-background text-status-yellow-text',
  rose: 'bg-status-rose-background text-status-rose-text',
  cyan: 'bg-status-cyan-background text-status-cyan-text',
  blue: 'bg-status-blue-background text-status-blue-text',
  purple: 'bg-status-purple-background text-status-purple-text',
};

/** Status chip, the table status pairs from the design system. */
export function Chip({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption-1-medium whitespace-nowrap',
        CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type StatusDotColor = 'green' | 'yellow' | 'red' | 'neutral';

const HALO: Record<StatusDotColor, string> = {
  green: 'bg-status-dot-green-halo',
  yellow: 'bg-status-dot-yellow-halo',
  red: 'bg-status-rose-background',
  neutral: 'bg-background-tertiary-default',
};

const CENTER: Record<StatusDotColor, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-rose-500',
  neutral: 'bg-text-tertiary',
};

/** 12×12 status indicator: a 6px dot on a tinted halo. */
export function StatusDot({
  color = 'green',
  className,
  label,
}: {
  color?: StatusDotColor;
  className?: string;
  /** Screen-reader text; the dot is decorative without it. */
  label?: string;
}) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('inline-flex size-3 shrink-0 items-center justify-center rounded-full', HALO[color], className)}
    >
      <span className={cx('size-1.5 rounded-full', CENTER[color])} />
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cx(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-kbd-background px-1 font-sans text-caption-1-medium text-kbd-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

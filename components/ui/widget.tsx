import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';

/**
 * Widget building blocks, from Jellydash components/dashboard/widget: a quiet
 * uppercase title, one big number, the detail pinned to the bottom of the
 * tile. Tiles are container queries, so their content adapts to the tile.
 */

export type Tone = 'ok' | 'warn' | 'err' | 'idle';

export const DOT: Record<Tone, string> = {
  ok: 'bg-chart-7',
  warn: 'bg-chart-8',
  err: 'bg-chart-3',
  idle: 'bg-text-tertiary/60',
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-status-lime-text',
  warn: 'text-status-yellow-text',
  err: 'text-status-rose-text',
  idle: 'text-text-tertiary',
};

/** Volume colour: the highlighted bar, the leading row. */
export const ACCENT = 'bg-chart-highlight';
/** Everything that is not highlighted. */
export const MUTED_BAR = 'bg-text-tertiary/50';

/** Usage (0–100) to tone, with the warning line one step before `max`. */
export function usageTone(value: number, max = 85): Tone {
  if (value >= max) return 'err';
  if (value >= Math.min(70, max - 5)) return 'warn';
  return 'ok';
}

/** A bordered tile on the page ground, the bento grid's cell. */
export function Tile({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'h-full rounded-3xl border border-border-button-default bg-background-secondary-default',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WidgetShell({
  title,
  meta,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('@container flex h-full min-h-40 flex-col gap-4 p-4 sm:p-5', className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="truncate text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">
          {title}
        </h2>
        {meta && <span className="shrink-0 text-body-2-regular text-text-tertiary">{meta}</span>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function Big({
  children,
  unit,
  className,
}: {
  children: ReactNode;
  unit?: string;
  className?: string;
}) {
  return (
    <p
      className={cx(
        'truncate text-display-4-regular tracking-tight text-text-primary tabular-nums',
        className,
      )}
    >
      {children}
      {unit && (
        <span className="text-body-2-regular tracking-normal text-text-tertiary"> {unit}</span>
      )}
    </p>
  );
}

export function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return (
    <span aria-hidden="true" className="relative inline-flex size-2 shrink-0">
      {pulse && (
        <span
          className={cx(
            'absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:hidden',
            DOT[tone],
          )}
        />
      )}
      <span className={cx('relative size-2 rounded-full', DOT[tone])} />
    </span>
  );
}

/** Label on the left, value on the right, one quiet line (inside a `<dl>`). */
export function Row({
  children,
  value,
  className,
}: {
  children: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center gap-2 text-body-2-regular', className)}>
      <dt className="flex min-w-0 items-center gap-2 text-text-primary">{children}</dt>
      <dd className="ml-auto shrink-0 text-text-tertiary tabular-nums">{value}</dd>
    </div>
  );
}

/** Thin rail with a fill, for ranked lists and gauges. */
export function Rail({
  pct,
  highlight = false,
  tone,
}: {
  pct: number;
  highlight?: boolean;
  /** Colours the fill by status instead of highlight/muted. */
  tone?: Tone;
}) {
  return (
    <span aria-hidden="true" className="block h-[3px] rounded-full bg-chart-track">
      <span
        className={cx(
          'block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none',
          tone ? DOT[tone] : highlight ? ACCENT : MUTED_BAR,
        )}
        style={{ width: `${Math.min(Math.max(pct, 2), 100)}%` }}
      />
    </span>
  );
}

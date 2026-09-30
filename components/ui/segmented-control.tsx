import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../utils/cx';

/**
 * Single-select segmented control (Jellydash components/base/segmented-control):
 * tertiary track, a white thumb that slides behind the selected segment.
 * Arrow keys move the selection.
 */

export type SegmentedOption<K extends string> = {
  key: K;
  label: ReactNode;
  /** Shown after the label in a quiet tone, e.g. a count. */
  count?: number;
};

type Thumb = { left: number; top: number; width: number; height: number };

export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const selected = el.querySelector<HTMLElement>('[aria-checked="true"]');
      if (selected) {
        setThumb({
          left: selected.offsetLeft,
          top: selected.offsetTop,
          width: selected.offsetWidth,
          height: selected.offsetHeight,
        });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);

  const move = (delta: number) => {
    const i = options.findIndex((o) => o.key === value);
    const next = options[(i + delta + options.length) % options.length];
    onChange(next.key);
    window.requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus(),
    );
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={cx(
        'relative inline-flex w-fit max-w-full items-start gap-0.5 overflow-x-auto rounded-2lg bg-segmented-control-background p-1 [scrollbar-width:none]',
        className,
      )}
    >
      {thumb && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 rounded-md bg-segmented-control-selected-background shadow-2xs transition-[transform,width,height] duration-200 ease-out"
          style={{
            transform: `translate(${thumb.left}px, ${thumb.top}px)`,
            width: thumb.width,
            height: thumb.height,
          }}
        />
      )}
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(-1);
              }
            }}
            className={cx(
              'relative z-10 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-center whitespace-nowrap',
              'transition-colors duration-200 ease-out',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
              selected
                ? 'text-body-medium text-text-primary'
                : 'text-body-regular text-text-secondary hover:text-text-primary',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className="text-body-2-regular text-text-tertiary tabular-nums">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

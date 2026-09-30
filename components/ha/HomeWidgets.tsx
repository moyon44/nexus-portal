import React, { useState } from 'react';
import { RiArrowDownSLine, RiArrowRightSLine } from '@remixicon/react';
import { useHaWidgets } from '../../hooks/useHaWidgets';
import { HaWidgetGrid } from './HaWidgetGrid';
import { cx } from '../../utils/cx';

/**
 * The home page's "Maison" section: the Home Assistant widgets marked for
 * the home page (pages/Maison.tsx has them all). Folds like a section; the
 * fold is remembered on this device. Nothing shows until one is marked.
 */

const KEY = 'portail:maison-folded';

const readFolded = () => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export function HomeWidgets() {
  const { data, reload } = useHaWidgets();
  const [folded, setFolded] = useState(readFolded);
  const widgets = (data?.widgets ?? []).filter(w => w.onHome);
  if (!data || !widgets.length) return null;

  const toggle = () => {
    const next = !folded;
    setFolded(next);
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // This page load only.
    }
  };

  return (
    <section aria-labelledby="maison-title">
      <header className="mb-3 flex min-h-8 items-center gap-2.5 px-1">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!folded}
          className="flex cursor-pointer items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-chart-7" />
          <h2 id="maison-title" className="section-title relative text-body-semibold text-text-primary">
            Maison
          </h2>
          <span className="text-body-2-regular text-text-tertiary tabular-nums">{widgets.length}</span>
          {folded ? <RiArrowRightSLine className="size-4 text-foreground-icon-tertiary" aria-hidden /> : <RiArrowDownSLine className="size-4 text-foreground-icon-tertiary" aria-hidden />}
        </button>
        <a href="#/maison" className={cx('ml-auto text-body-2-regular text-text-tertiary hover:text-text-primary')}>
          Tout voir
        </a>
      </header>
      {!folded && <HaWidgetGrid widgets={widgets} data={data} onChanged={reload} />}
    </section>
  );
}

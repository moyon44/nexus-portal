import React from 'react';
import type { HaWidget, HaWidgetsData } from '../../types';
import { HaWidgetCard } from './HaWidgetCard';

/**
 * The widgets on a responsive grid (a "wide" one spans two columns). The
 * Maison page passes `toolbar` to add its editing strip to each card.
 */
export function HaWidgetGrid({
  widgets,
  data,
  onChanged,
  toolbar,
}: {
  widgets: HaWidget[];
  data: HaWidgetsData;
  onChanged: () => void;
  toolbar?: (w: HaWidget, index: number) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
      {widgets.map((w, i) => (
        <React.Fragment key={w.id}>
          <HaWidgetCard widget={w} data={data} onChanged={onChanged} toolbar={toolbar?.(w, i)} />
        </React.Fragment>
      ))}
    </div>
  );
}

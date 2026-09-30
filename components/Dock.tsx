import React, { useRef, useState } from 'react';
import { RiHistoryLine } from '@remixicon/react';
import { useDashboard } from '../store';
import { treeOrder } from '../lib/links';
import { openService } from '../lib/actions';
import type { Service } from '../types';
import { LinkIcon } from './LinkIcon';
import { cx } from '../utils/cx';
import { flyTo } from '../lib/motion';
import { PenNote } from './Doodle';

/**
 * Favourites as a dock (21st.dev / macOS style): big frameless logos that
 * swell as the pointer passes, each with its shortcut digit. Next to it, the
 * last links opened. Both hide when empty.
 */

const MAX_SCALE = 1.35;
const RANGE = 110; // px around the pointer that feel the magnification

function relative(at: string) {
  const s = (Date.now() - new Date(at).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}

function DockItem({
  service,
  digit,
  scale,
  itemRef,
  onOpen,
}: {
  service: Service;
  digit: number | null;
  scale: number;
  itemRef: (el: HTMLAnchorElement | null) => void;
  onOpen: () => void;
}) {
  const offline = service.status === 'offline';
  return (
    <a
      ref={itemRef}
      href={service.url}
      target={service.openInNewTab ? '_blank' : undefined}
      rel="noopener noreferrer"
      onClick={e => {
        // The logo flies to its tile, so you see where it lives.
        const icon = e.currentTarget.querySelector<HTMLElement>('[data-dock-icon]');
        const target = document.querySelector<HTMLElement>(`[data-tile="${service.id}"] .tile-logo`);
        if (icon && target) flyTo(icon, target);
        onOpen();
      }}
      onAuxClick={e => e.button === 1 && onOpen()}
      title={digit ? `${service.name} · touche ${digit}` : service.name}
      className="group/dock relative flex w-16 flex-col items-center gap-1.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <span
        data-dock-icon
        className="relative grid size-12 place-items-center rounded-2xl bg-background-secondary-default/60 shadow-card transition-transform duration-150 ease-out will-change-transform group-active/dock:scale-90"
        style={{ transform: `translateY(${-(scale - 1) * 18}px) scale(${scale})` }}
      >
        <LinkIcon service={service} size={30} />
        {offline && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-chart-3 ring-2 ring-background-full" />}
        {digit && (
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-md bg-background-tertiary-default text-[10px] font-semibold text-text-secondary tabular-nums opacity-0 transition-opacity group-hover/dock:opacity-100">
            {digit}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-caption-1-medium text-text-tertiary transition-colors group-hover/dock:text-text-primary">
        {service.name}
      </span>
    </a>
  );
}

export function Dock() {
  const { data, logAccess } = useDashboard();
  const favorites = treeOrder(data.services, data.categories).filter(s => s.isFavorite);
  const byId = new Map(data.services.map(s => [s.id, s]));
  const recent = data.recent
    .map(r => ({ service: byId.get(r.id), at: r.at }))
    .filter((r): r is { service: Service; at: string } => !!r.service && r.service.isVisible)
    .slice(0, 5);

  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [scales, setScales] = useState<number[]>([]);
  const frame = useRef(0);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const x = e.clientX;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() =>
      setScales(
        refs.current.map(el => {
          if (!el) return 1;
          const r = el.getBoundingClientRect();
          const d = Math.abs(x - (r.left + r.width / 2));
          return 1 + (MAX_SCALE - 1) * Math.max(0, 1 - d / RANGE) ** 2;
        }),
      ),
    );
  };

  if (!favorites.length && !recent.length) return null;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
      {favorites.length > 0 && (
        <div className="relative">
        {data.theme.skin === 'paper' && <PenNote className="absolute -top-7 left-[calc(100%+4px)] hidden md:flex">tes raccourcis</PenNote>}
        <nav
          aria-label="Favoris"
          onPointerMove={onMove}
          onPointerLeave={() => setScales([])}
          className="-mx-1 flex flex-wrap items-end gap-1 px-1 pt-3"
        >
          {favorites.map((s, i) => (
            <DockItem
              key={s.id}
              service={s}
              digit={i < 9 ? i + 1 : null}
              scale={scales[i] ?? 1}
              itemRef={el => {
                refs.current[i] = el;
              }}
              onOpen={() => logAccess(s.id)}
            />
          ))}
        </nav>
        </div>
      )}

      {recent.length > 0 && (
        <section aria-label="Récents" className="flex min-w-0 flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">
            <RiHistoryLine className="size-3.5" aria-hidden /> Récents
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {recent.map(({ service, at }) => (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={() => {
                    logAccess(service.id);
                    openService(service);
                  }}
                  title={`${service.name} · ${relative(at)}`}
                  className={cx(
                    'flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border-button-default bg-background-secondary-default/50 py-1 pr-3 pl-1.5',
                    'text-body-2-medium text-text-secondary outline-none transition-colors hover:border-border-button-hover hover:text-text-primary',
                    'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                  )}
                >
                  <span className="grid size-5 place-items-center">
                    <LinkIcon service={service} size={16} />
                  </span>
                  <span className="max-w-32 truncate">{service.name}</span>
                  <span className="text-caption-1-regular text-text-tertiary">{relative(at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

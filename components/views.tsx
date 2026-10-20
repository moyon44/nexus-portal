import React from 'react';
import { RiStarFill, RiStarLine } from '@remixicon/react';
import type { Service, ServiceHealth, Widget } from '../types';
import { LinkIcon } from './LinkIcon';
import { Kbd } from './ui/badge';
import { Sparkline } from './ui/sparkline';
import { hostOf } from '../lib/actions';
import { useBrandColor, useLogoSrc } from '../lib/brandColor';
import { cx } from '../utils/cx';
import { burst } from '../lib/motion';
import { SLOW_MS, githubRepo } from '../lib/github';

/**
 * The home page's other display styles (the card is components/ServiceTile).
 * Each item is the link itself and shares the same props, so the page can
 * swap styles without changing its drag, menu or keyboard handling.
 *
 *   ServiceRow   · Liste   — one dense line with everything
 *   ServiceIcon  · Icônes  — an app icon and its name, home-screen style
 *   BentoCard    · Bento   — a large card for favourites and busy services
 *   TextLink     · Texte   — a plain line of text for the start-page style
 */

export interface ViewItemProps {
  service: Service;
  health?: ServiceHealth;
  widget?: Widget;
  favoriteIndex: number | null;
  highlight?: string | null;
  index: number;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onContextMenu: (e: React.MouseEvent | React.KeyboardEvent) => void;
  baseDomain?: string | null;
  active?: boolean;
  celebrate?: boolean;
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? null : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

/** Where a link points: the owner for a GitHub repository, else the host. */
function place(url: string, base?: string | null) {
  const repo = githubRepo(url);
  return repo ? `GitHub · ${repo.owner}` : shortHost(url, base);
}

/** "lent" for a slow answer, nothing otherwise (the figure is in the details panel). */
const slowLabel = (health?: ServiceHealth | null) => (health?.latency != null && health.latency >= SLOW_MS ? 'lent' : '');

function shortHost(url: string, base?: string | null) {
  const h = hostOf(url);
  return base && h.endsWith(`.${base}`) ? h.slice(0, -base.length - 1) : h;
}

/** The anchor that makes the whole item clickable, with menu keys. */
function Cover({ service, onOpen, onContextMenu, title }: Pick<ViewItemProps, 'service' | 'onOpen' | 'onContextMenu'> & { title?: string }) {
  return (
    <a
      href={service.url}
      target={service.openInNewTab ? '_blank' : undefined}
      rel="noopener noreferrer"
      draggable={false}
      title={title}
      aria-label={`${service.name}${service.status === 'offline' ? ', hors ligne' : ''}`}
      onClick={onOpen}
      onAuxClick={e => e.button === 1 && onOpen()}
      onKeyDown={e => {
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    />
  );
}

function Dot({ status, className }: { status: Service['status']; className?: string }) {
  return (
    <span
      aria-hidden
      data-state={status}
      className={cx(
        'status-dot relative block size-2 shrink-0 rounded-full',
        status === 'offline' ? 'bg-chart-3' : status === 'online' ? 'bg-chart-7' : 'bg-text-tertiary/60',
        className,
      )}
    />
  );
}

function Bars({ health, count = 30, className }: { health?: ServiceHealth; count?: number; className?: string }) {
  const samples = health?.history.slice(-count) ?? [];
  return (
    <span aria-hidden className={cx('flex h-3 items-stretch gap-px', className)}>
      {Array.from({ length: count - samples.length }, (_, i) => (
        <span key={`p${i}`} className="w-[3px] rounded-full bg-chart-track" />
      ))}
      {samples.map(s => (
        <span key={s.t} className={cx('w-[3px] rounded-full', s.up ? 'bg-chart-7/70' : 'bg-chart-3')} />
      ))}
    </span>
  );
}

function FavButton({ service, favoriteIndex, onToggleFavorite, className }: Pick<ViewItemProps, 'service' | 'favoriteIndex' | 'onToggleFavorite'> & { className?: string }) {
  const digit = favoriteIndex !== null && favoriteIndex < 9 ? favoriteIndex + 1 : null;
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        if (!service.isFavorite) burst(e.currentTarget);
        onToggleFavorite();
      }}
      aria-pressed={service.isFavorite}
      aria-label={service.isFavorite ? `Retirer ${service.name} des favoris` : `Ajouter ${service.name} aux favoris`}
      title={digit ? `Favori · touche ${digit}` : service.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={cx(
        'relative z-10 grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring',
        !service.isFavorite && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        className,
      )}
    >
      {service.isFavorite ? (
        digit ? (
          <>
            <Kbd className="group-hover:hidden">{digit}</Kbd>
            <RiStarFill className="hidden size-4 text-chart-8 group-hover:block" aria-hidden />
          </>
        ) : (
          <RiStarFill className="size-4 text-chart-8" aria-hidden />
        )
      ) : (
        <RiStarLine className="size-4 text-foreground-icon-secondary" aria-hidden />
      )}
    </button>
  );
}

const highlightStyle = (highlight?: string | null): React.CSSProperties =>
  highlight ? { boxShadow: `0 0 0 1px ${highlight}, 0 0 24px -6px ${highlight}`, borderColor: highlight } : {};

/* ----- Liste -------------------------------------------------------------- */

export function ServiceRow(p: ViewItemProps) {
  const { service, health, widget, baseDomain } = p;
  const brand = useBrandColor(useLogoSrc(service));
  const offline = service.status === 'offline';
  const live = widget?.ok && widget.summary ? widget.summary : null;
  return (
    <div
      className="row-item group tile-enter"
      data-offline={offline || undefined}
      data-tile={service.id}
      data-celebrate={p.celebrate || undefined}
      style={{ ...(brand ? ({ '--brand': brand } as React.CSSProperties) : {}), animationDelay: `${Math.min(p.index, 30) * 12}ms`, ...highlightStyle(p.highlight) }}
      onContextMenu={e => {
        e.preventDefault();
        p.onContextMenu(e);
      }}
    >
      <Cover service={service} onOpen={p.onOpen} onContextMenu={p.onContextMenu} title={service.description || service.url} />
      <span className="tile-logo pointer-events-none relative grid size-8 shrink-0 place-items-center rounded-[9px] bg-background-tertiary-default/70">
        <LinkIcon service={service} size={20} />
      </span>
      <span className="pointer-events-none flex min-w-0 flex-col">
        <span className="truncate text-body-semibold text-text-primary">{service.name}</span>
        {service.description && <span className="truncate text-body-2-regular text-text-tertiary">{service.description}</span>}
      </span>
      <span className="pointer-events-none hidden min-w-0 truncate text-body-2-regular text-text-tertiary md:block">
        {place(service.url, baseDomain)}
      </span>
      <span className="pointer-events-none hidden min-w-0 truncate text-body-2-regular text-text-secondary lg:block">
        {live ?? ''}
      </span>
      <span className="pointer-events-none hidden text-right text-body-2-regular text-status-yellow-text sm:block">
        {offline ? '' : slowLabel(health)}
      </span>
      <span className="pointer-events-none hidden xl:block" title={pct(health?.uptime24h) ? `24 h : ${pct(health?.uptime24h)}` : undefined}>
        <Bars health={health} count={24} />
      </span>
      <span className="pointer-events-none flex items-center justify-end gap-2">
        {offline ? (
          <span className="rounded-md bg-status-rose-background px-1.5 text-caption-1-medium text-status-rose-text">Hors ligne</span>
        ) : (
          <Dot status={service.status} />
        )}
      </span>
      <FavButton service={service} favoriteIndex={p.favoriteIndex} onToggleFavorite={p.onToggleFavorite} />
      {p.active && !offline && <span aria-hidden className="tile-beam" />}
    </div>
  );
}

/* ----- Icônes -------------------------------------------------------------- */

export function ServiceIcon(p: ViewItemProps) {
  const { service } = p;
  const logo = useLogoSrc(service);
  const brand = useBrandColor(logo);
  const offline = service.status === 'offline';
  const digit = p.favoriteIndex !== null && p.favoriteIndex < 9 ? p.favoriteIndex + 1 : null;
  return (
    <div
      className="icon-item group tile-enter"
      data-offline={offline || undefined}
      data-tile={service.id}
      data-celebrate={p.celebrate || undefined}
      style={{ ...(brand ? ({ '--brand': brand } as React.CSSProperties) : {}), animationDelay: `${Math.min(p.index, 30) * 14}ms` }}
      onContextMenu={e => {
        e.preventDefault();
        p.onContextMenu(e);
      }}
    >
      <Cover service={service} onOpen={p.onOpen} onContextMenu={p.onContextMenu} title={`${service.name} · ${hostOf(service.url)}`} />
      <span className="icon-squircle tile-logo pointer-events-none" style={highlightStyle(p.highlight)}>
        {logo && <img src={logo} alt="" className="icon-ambient" loading="lazy" />}
        <LinkIcon service={service} size={36} />
        <Dot status={service.status} className="absolute -right-0.5 -bottom-0.5 size-3 ring-2 ring-background-full" />
        {p.active && !offline && <span aria-hidden className="tile-beam" />}
      </span>
      <span className={cx('pointer-events-none w-full truncate text-center text-body-2-medium', offline ? 'text-status-rose-text' : 'text-text-secondary group-hover:text-text-primary')}>
        {service.name}
      </span>
      {digit && (
        <span className="pointer-events-none absolute top-0 right-3 grid size-4 place-items-center rounded-md bg-background-tertiary-default text-[10px] font-semibold text-text-secondary tabular-nums">
          {digit}
        </span>
      )}
    </div>
  );
}

/* ----- Bento --------------------------------------------------------------- */

/** Big cards go to favourites and to services with something to show. */
export const isBentoHero = (s: Service, widget?: Widget) => s.isFavorite || !!(widget?.ok && widget.summary);

export function BentoCard(p: ViewItemProps) {
  const { service, health, widget, baseDomain } = p;
  const logo = useLogoSrc(service);
  const brand = useBrandColor(logo);
  const offline = service.status === 'offline';
  const live = widget?.ok && widget.summary ? widget : null;
  const latencies = (health?.history ?? []).map(h => h.ms ?? 0);
  return (
    <div
      className="tile tile-hero tile-enter group"
      data-offline={offline || undefined}
      data-tile={service.id}
      data-fav={service.isFavorite || undefined}
      data-celebrate={p.celebrate || undefined}
      style={{ ...(brand ? ({ '--brand': brand } as React.CSSProperties) : {}), animationDelay: `${Math.min(p.index, 24) * 20}ms`, ...highlightStyle(p.highlight) }}
      onContextMenu={e => {
        e.preventDefault();
        p.onContextMenu(e);
      }}
    >
      <Cover service={service} onOpen={p.onOpen} onContextMenu={p.onContextMenu} title={service.description || service.url} />
      <span aria-hidden className="tile-fx">
        {logo && <img src={logo} alt="" className="tile-ambient tile-ambient-hero" loading="lazy" />}
        <span className="tile-glare" />
        {service.isFavorite && <span className="tile-holo" />}
      </span>

      <span className="pointer-events-none flex w-full items-start justify-between gap-3">
        <span className="tile-logo relative grid size-12 shrink-0 place-items-center rounded-[14px] bg-background-tertiary-default/70">
          <LinkIcon service={service} size={32} />
          <Dot status={service.status} className="absolute -right-0.5 -bottom-0.5 size-3 ring-2 ring-background-secondary-default" />
        </span>
        <span className="pointer-events-auto">
          <FavButton service={service} favoriteIndex={p.favoriteIndex} onToggleFavorite={p.onToggleFavorite} />
        </span>
      </span>

      <span className="pointer-events-none flex min-w-0 flex-col">
        <span className="truncate text-headline-semibold text-text-primary">{service.name}</span>
        <span className="tile-meta flex items-center gap-1.5">
          {offline ? (
            <span className="rounded-md bg-status-rose-background px-1.5 text-caption-1-medium text-status-rose-text">Hors ligne</span>
          ) : null}
          <span className="truncate">{place(service.url, baseDomain)}</span>
          {!offline && slowLabel(health) && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0 text-status-yellow-text">{slowLabel(health)}</span>
            </>
          )}
        </span>
      </span>

      {live ? (
        <span className="pointer-events-none flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-body-medium text-text-primary">{live.summary}</span>
          {live.items.slice(0, 2).map(item => (
            <span key={item} className="truncate text-body-2-regular text-text-tertiary">
              {item}
            </span>
          ))}
        </span>
      ) : (
        service.description && (
          <span className="pointer-events-none line-clamp-2 text-body-2-regular text-text-tertiary">{service.description}</span>
        )
      )}

      <span className="pointer-events-none mt-auto flex w-full items-end justify-between gap-3">
        <Bars health={health} count={30} />
        <span className="flex items-center gap-2 text-caption-1-medium text-text-tertiary tabular-nums">
          {pct(health?.uptime24h) && <span title="Disponibilité sur 24 h">{pct(health?.uptime24h)}</span>}
          {latencies.length > 1 && (
            <Sparkline values={latencies} max={Math.max(100, ...latencies)} className="text-[color:var(--brand,var(--color-accent-400))]" label={`Latence de ${service.name}`} />
          )}
        </span>
      </span>

      {p.active && !offline && <span aria-hidden className="tile-beam" />}
    </div>
  );
}

/* ----- Texte ---------------------------------------------------------------- */

export function TextLink(p: ViewItemProps) {
  const { service } = p;
  const offline = service.status === 'offline';
  return (
    <div
      className="text-link group tile-enter"
      data-tile={service.id}
      style={{ animationDelay: `${Math.min(p.index, 40) * 10}ms`, ...(p.highlight ? { color: p.highlight } : {}) }}
      onContextMenu={e => {
        e.preventDefault();
        p.onContextMenu(e);
      }}
    >
      <Cover service={service} onOpen={p.onOpen} onContextMenu={p.onContextMenu} title={service.url} />
      <span className="tile-logo pointer-events-none grid size-4 shrink-0 place-items-center opacity-70 grayscale transition group-hover:opacity-100 group-hover:grayscale-0">
        <LinkIcon service={service} size={16} />
      </span>
      <span className={cx('pointer-events-none min-w-0 truncate', offline && 'text-status-rose-text line-through decoration-1')}>
        {service.name}
      </span>
      {service.isFavorite && <RiStarFill className="pointer-events-none size-3 shrink-0 text-chart-8/80" aria-hidden />}
      <span className="pointer-events-none ml-auto shrink-0 text-caption-1-regular text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 tabular-nums">
        {offline ? 'hors ligne' : p.health?.latency != null ? `${p.health.latency} ms` : ''}
      </span>
    </div>
  );
}

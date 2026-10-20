import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { auditApi, linksApi, type LinkCard, type TimelineEntry } from '../api';
import type { Service, ServiceHealth, Widget } from '../types';
import { containerOf, hostOf } from '../lib/actions';
import { useDeadLink } from '../lib/deadLinks';

/**
 * Hover card of a tile, after a short pause (Aceternity's "Link Preview"):
 *  - external links: the site's share image and description, so "Refero"
 *    or "Bencho" remind what they are;
 *  - home-lab services (LAN addresses, the shared domain): their live
 *    lines, availability 24 h / 7 d, response time, the container's CPU /
 *    RAM and the last action on them from the history.
 * It replaces the browser tooltip. Mouse only; anything else (scroll,
 * click, keys, right-click) hides it.
 */

const DELAY = 550;
const WIDTH = 320;
const GAP = 10;

/** Cards fetched this session (the backend caches them a day). */
const cache = new Map<string, LinkCard | null>();
/** Last history line per service, for a minute. */
const lastActions = new Map<string, { at: number; entry: TimelineEntry | null }>();

async function lastActionOf(service: Service, container: string | undefined): Promise<TimelineEntry | null> {
  const hit = lastActions.get(service.id);
  if (hit && Date.now() - hit.at < 60_000) return hit.entry;
  const r = await auditApi.timeline({ limit: 1, entity: [service.id, ...(container ? [container] : [])] });
  const entry = r.entries[0] ?? null;
  lastActions.set(service.id, { at: Date.now(), entry });
  return entry;
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? '–' : `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hier' : `il y a ${d} j`;
}

const PRIVATE_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])$|\.(local|lan|home|internal)$/i;

export function isExternal(url: string, baseDomain?: string | null) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || PRIVATE_HOST.test(h)) return false;
    return !(baseDomain && (h === baseDomain || h.endsWith(`.${baseDomain}`)));
  } catch {
    return false;
  }
}

type Shown = { service: Service; rect: DOMRect } & ({ kind: 'external'; card: LinkCard } | { kind: 'internal' });

export function LinkPreviewLayer({
  services,
  baseDomain,
  health,
  widgets,
}: {
  services: Service[];
  baseDomain?: string | null;
  health: Record<string, ServiceHealth>;
  widgets: Record<string, Widget>;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [imgOk, setImgOk] = useState(true);
  const [last, setLast] = useState<TimelineEntry | null | undefined>(undefined);
  const byId = useRef(new Map<string, Service>());
  byId.current = new Map(services.map(s => [s.id, s]));
  const healthRef = useRef(health);
  healthRef.current = health;

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    let controller: AbortController | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      controller?.abort();
      controller = null;
      current = null;
      setShown(null);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const tile = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tile]') ?? null;
      if (tile === current) return;
      hide();
      if (!tile || tile.closest('[data-flipped]')) return;
      const service = byId.current.get(tile.dataset.tile ?? '');
      if (!service) return;
      current = tile;
      if (!isExternal(service.url, baseDomain)) {
        timer = window.setTimeout(() => {
          if (current !== tile) return;
          setLast(undefined);
          setShown({ service, rect: tile.getBoundingClientRect(), kind: 'internal' });
          const container = containerOf(service) ?? healthRef.current[service.id]?.container?.name;
          lastActionOf(service, container)
            .then(e => current === tile && setLast(e))
            .catch(() => current === tile && setLast(null));
        }, DELAY);
        return;
      }
      timer = window.setTimeout(async () => {
        let card = cache.get(service.url);
        if (card === undefined) {
          controller = new AbortController();
          try {
            card = await linksApi.card(service.url, controller.signal);
          } catch {
            if (controller.signal.aborted) return;
            card = null;
          }
          cache.set(service.url, card);
        }
        if (current !== tile || !card || (!card.image && !card.description)) return;
        setImgOk(true);
        setShown({ service, rect: tile.getBoundingClientRect(), kind: 'external', card });
      }, DELAY);
    };

    const onOut = (e: PointerEvent) => {
      if (!current) return;
      const to = e.relatedTarget as Node | null;
      if (to && current.contains(to)) return;
      hide();
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('contextmenu', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('contextmenu', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, [baseDomain]);

  if (!shown) return null;
  const { rect, service } = shown;
  const card = shown.kind === 'external' ? shown.card : null;
  const image = card?.image && imgOk ? card.image : null;
  // Above the tile when there is room for the card, else below it.
  const estimate = card ? (image ? (WIDTH * 630) / 1200 : 0) + (card.description ? 92 : 48) : 190;
  const above = rect.top - GAP - estimate > 8;
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - 8));
  const style: React.CSSProperties = above
    ? { left, bottom: window.innerHeight - rect.top + GAP, width: WIDTH }
    : { left, top: rect.bottom + GAP, width: WIDTH };

  return createPortal(
    <div
      role="tooltip"
      style={style}
      className="link-preview pointer-events-none fixed z-[65] overflow-hidden rounded-2xl border border-border-button-default bg-background-secondary-default shadow-dropdown"
      data-side={above ? 'top' : 'bottom'}
    >
      {card ? (
        <>
          {image && (
            <img
              src={image}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setImgOk(false)}
              className="aspect-[1200/630] w-full bg-background-tertiary-default object-cover"
            />
          )}
          <div className="flex flex-col gap-1 px-3.5 py-3">
            <span className="truncate text-caption-1-medium text-text-tertiary">{hostOf(service.url)}</span>
            {card.description && <p className="line-clamp-3 text-body-2-regular text-text-secondary">{card.description}</p>}
            <DeadNote id={service.id} />
          </div>
        </>
      ) : (
        <InternalCard service={service} health={health[service.id]} widget={widgets[service.id]} last={last} />
      )}
    </div>,
    document.body,
  );
}

function DeadNote({ id }: { id: string }) {
  const dead = useDeadLink(id);
  return dead ? <p className="text-body-2-regular text-status-yellow-text">Lien mort : {dead}</p> : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-body-2-regular">
      <span className="shrink-0 whitespace-nowrap text-text-tertiary">{label}</span>
      <span className="min-w-0 truncate text-right text-text-primary tabular-nums">{children}</span>
    </div>
  );
}

function InternalCard({
  service,
  health,
  widget,
  last,
}: {
  service: Service;
  health?: ServiceHealth;
  widget?: Widget;
  last: TimelineEntry | null | undefined;
}) {
  const offline = service.status === 'offline';
  const live = widget?.ok ? widget.items.slice(0, 4) : [];
  const c = health?.container;
  return (
    <div className="flex flex-col gap-2.5 px-3.5 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-body-semibold text-text-primary">{service.name}</span>
        <span className="truncate text-caption-1-regular text-text-tertiary">{hostOf(service.url)}</span>
      </div>
      {service.description && <p className="line-clamp-2 text-body-2-regular text-text-secondary">{service.description}</p>}
      {live.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-l-2 border-border-button-default pl-2.5">
          {live.map((line, i) => (
            <li key={i} className="truncate text-body-2-regular text-text-secondary">
              {line}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1">
        {offline ? (
          <Row label="État">
            <span className="text-status-rose-text">Hors ligne</span>
          </Row>
        ) : health?.latency != null ? (
          <Row label="Réponse">{health.latency} ms</Row>
        ) : null}
        {health && (health.uptime24h != null || health.uptime7d != null) && (
          <Row label="Dispo 24 h · 7 j">
            {pct(health.uptime24h)} · {pct(health.uptime7d)}
          </Row>
        )}
        {c && (
          <Row label={c.name}>
            CPU {c.cpu} % · RAM {c.ram} %
          </Row>
        )}
      </div>
      <p className="border-t border-border-button-default pt-2 text-body-2-regular text-text-tertiary">
        Dernière action :{' '}
        <span className="text-text-secondary">
          {last === undefined ? '…' : last ? `${last.title.toLowerCase()} ${ago(last.at)}` : 'aucune'}
        </span>
      </p>
    </div>
  );
}

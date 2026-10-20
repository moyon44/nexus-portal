import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RiArrowGoBackLine, RiExternalLinkLine, RiFileCopyLine, RiGithubFill, RiLoopLeftLine, RiStarFill, RiStarLine } from '@remixicon/react';
import type { Service, ServiceHealth, ThemeConfig, Widget } from '../types';
import { LinkIcon } from './LinkIcon';
import { Kbd } from './ui/badge';
import { containerOf, copyText, hostOf } from '../lib/actions';
import { UpdateBadge } from './UpdateBadge';
import { qrPath, setFlipped, toggleFlipped, useFlipped } from '../lib/flip';
import { useShell } from '../lib/shell';
import { useBrandColor, useLogoSrc } from '../lib/brandColor';
import { cx } from '../utils/cx';
import { burst } from '../lib/motion';
import { useDashboard } from '../store';
import { WobbleText, type WobbleHandle } from './WobbleText';
import { SLOW_MS, githubRepo } from '../lib/github';
import { useDeadLink } from '../lib/deadLinks';

/**
 * Home page tile, pared down: the app's logo and its name. Where it lives,
 * how fast it answers and the strip of recent checks come in on hover.
 *
 * Two things always show because they matter: a live widget line
 * (qBittorrent speeds, Jellyfin now playing…) and an outage (red dot, red
 * badge, tinted tile). Health otherwise stays a small green dot on the logo.
 */

const BARS = 30;

function UptimeStrip({ health }: { health?: ServiceHealth }) {
  const samples = health?.history.slice(-BARS) ?? [];
  const pad = BARS - samples.length;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-3 bottom-1.5 flex h-[3px] gap-px opacity-0 transition-opacity duration-200 group-hover:opacity-100"
    >
      {Array.from({ length: pad }, (_, i) => (
        <span key={`p${i}`} className="flex-1 rounded-full bg-chart-track" />
      ))}
      {samples.map(s => (
        <span key={s.t} className={cx('flex-1 rounded-full', s.up ? 'bg-chart-7/70' : 'bg-chart-3')} />
      ))}
    </span>
  );
}

/**
 * Back of a turned-over tile: a QR code to open the link on a phone, the
 * full address and the notes (the link's description). It floats a little
 * larger than the tile, kept inside the scrolling area.
 */
function TileBack({ service, open, onClose }: { service: Service; open: boolean; onClose: () => void }) {
  const { notify, openDetails } = useShell();
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const qr = React.useMemo(() => qrPath(service.url), [service.url]);

  useLayoutEffect(() => {
    const tile = ref.current?.parentElement?.getBoundingClientRect();
    if (!tile) return;
    // <main> scrolls, so it clips whatever sticks out of it (e.g. under the sidebar).
    const area = ref.current!.closest('main')?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth };
    const width = Math.min(Math.max(tile.width, 320), area.right - area.left - 24);
    let left = (tile.width - width) / 2;
    left = Math.max(area.left + 12 - tile.left, Math.min(left, area.right - 12 - tile.left - width));
    setBox({ left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.('[role="menu"]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const btn =
    'flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-caption-1-medium text-text-secondary outline-none hover:bg-background-tertiary-default hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring';

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Dos de la carte ${service.name}`}
      className="tile-back"
      data-open={open || undefined}
      style={box ? { left: box.left, width: box.width } : { visibility: 'hidden' }}
    >
      <a href={service.url} target="_blank" rel="noopener noreferrer" className="tile-qr" title="Scanner pour ouvrir sur un téléphone">
        <svg viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`} shapeRendering="crispEdges" aria-label={`QR code de ${service.url}`}>
          <rect x="-2" y="-2" width={qr.size + 4} height={qr.size + 4} fill="#fff" />
          <path d={qr.d} fill="#000" />
        </svg>
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-body-semibold text-text-primary">{service.name || 'Sans nom'}</span>
        <span className="line-clamp-2 font-mono text-caption-1-regular break-all text-text-secondary">{service.url}</span>
        {service.description ? (
          <p className="line-clamp-3 text-caption-1-regular text-text-tertiary">{service.description}</p>
        ) : (
          <button type="button" className="self-start text-caption-1-regular text-text-tertiary italic underline-offset-2 hover:underline" onClick={() => { onClose(); openDetails(service); }}>
            Pas de note · en ajouter une
          </button>
        )}
        <div className="-ml-2 mt-auto flex flex-wrap items-center gap-0.5">
          <button type="button" className={btn} onClick={async () => notify((await copyText(service.url)) ? 'Adresse copiée' : 'Copie impossible', 'ok')}>
            <RiFileCopyLine className="size-3.5" aria-hidden /> Copier
          </button>
          <a href={service.url} target="_blank" rel="noopener noreferrer" className={btn}>
            <RiExternalLinkLine className="size-3.5" aria-hidden /> Ouvrir
          </a>
          <button type="button" className={cx(btn, 'ml-auto')} onClick={onClose} autoFocus>
            <RiArrowGoBackLine className="size-3.5" aria-hidden /> Retourner
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ServiceTileProps {
  service: Service;
  health?: ServiceHealth;
  widget?: Widget;
  density: ThemeConfig['density'];
  /** 0-based rank among favourites; the digit key opens it (first nine). */
  favoriteIndex: number | null;
  /** Outline colour while the link is hovered in the tree (or just added). */
  highlight?: string | null;
  /** Entrance order, for the staggered fade. */
  index: number;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onContextMenu: (e: React.MouseEvent | React.KeyboardEvent) => void;
  showDescription: boolean;
  /** Domain most links share (example.com); left out of the host shown. */
  baseDomain?: string | null;
  /** Something is going on (playback, downloads, just recovered): border beam. */
  active?: boolean;
  /** Just came back online: glow and sparks. */
  celebrate?: boolean;
}

export const ServiceTile: React.FC<ServiceTileProps> = ({
  service,
  health,
  widget,
  density,
  favoriteIndex,
  highlight,
  index,
  onOpen,
  onToggleFavorite,
  onContextMenu,
  showDescription,
  baseDomain,
  active,
  celebrate,
}) => {
  const compact = density === 'compact';
  const status = service.status;
  const offline = status === 'offline';
  const latency = health?.latency ?? null;
  // Only a slow answer is worth a word on the card; the exact figure stays in
  // the details panel.
  const slow = latency !== null && latency >= SLOW_MS;
  const repo = githubRepo(service.url);
  const dead = useDeadLink(service.id);
  const fullHost = hostOf(service.url);
  const host =
    baseDomain && fullHost.endsWith(`.${baseDomain}`) ? fullHost.slice(0, -baseDomain.length - 1) : fullHost;
  const digit = favoriteIndex !== null && favoriteIndex < 9 ? favoriteIndex + 1 : null;
  const container = health?.container;
  const live = widget?.ok && widget.summary ? widget : null;
  const logo = useLogoSrc(service);
  const brand = useBrandColor(logo);
  const paper = useDashboard().data.theme.skin === 'paper';
  const wobble = useRef<WobbleHandle>(null);
  const flipped = useFlipped(service.id);
  // Keeps the back mounted while it turns away.
  const [showBack, setShowBack] = useState(false);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (flipped) {
      setShowBack(true);
      setReturning(false);
      return;
    }
    if (!showBack) return;
    setReturning(true);
    const t = window.setTimeout(() => {
      setShowBack(false);
      setReturning(false);
    }, 650);
    return () => window.clearTimeout(t);
  }, [flipped]);
  const closeBack = React.useCallback(() => setFlipped(null), []);

  const meta = (
    <>
      {repo ? (
        <>
          <RiGithubFill className="size-3 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{repo.owner}</span>
        </>
      ) : (
        <span className="min-w-0 truncate">{host}</span>
      )}
      {dead ? (
        <>
          <span aria-hidden>·</span>
          <span className="shrink-0 text-status-yellow-text" title={dead}>lien mort</span>
        </>
      ) : slow && (
        <>
          <span aria-hidden>·</span>
          <span className="shrink-0 text-status-yellow-text">lent</span>
        </>
      )}
    </>
  );

  return (
    <>
    <div
      className="tile tile-enter group"
      data-tile={service.id}
      data-flippable={service.id}
      data-flipped={flipped || undefined}
      data-returning={returning || undefined}
      inert={flipped || undefined}
      data-celebrate={celebrate || undefined}
      data-offline={offline || undefined}
      data-density={density}
      data-fav={service.isFavorite || undefined}
      style={{
        ...(brand ? ({ '--brand': brand } as React.CSSProperties) : {}),
        animationDelay: `${Math.min(index, 24) * 18}ms`,
        ...(highlight ? { borderColor: highlight, boxShadow: `0 0 0 1px ${highlight}, 0 0 24px -6px ${highlight}` } : {}),
      }}
      onContextMenu={e => {
        e.preventDefault();
        onContextMenu(e);
      }}
      onPointerMove={paper ? () => wobble.current?.hit() : undefined}
    >
      {/* The tile is the link; everything else sits above it. */}
      <a
        href={service.url}
        target={service.openInNewTab ? '_blank' : undefined}
        rel="noopener noreferrer"
        draggable={false}
        // No browser tooltip: the hover card (components/LinkPreviewCard.tsx) tells more.
        aria-label={`${service.name}${offline ? ', hors ligne' : ''}`}
        onClick={onOpen}
        onAuxClick={e => e.button === 1 && onOpen()}
        onKeyDown={e => {
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault();
            onContextMenu(e);
          } else if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            toggleFlipped(service.id);
          }
        }}
        className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      />

      {/* Card layers: ambient glow of the logo, glare under the pointer, holo foil (favourites). */}
      <span aria-hidden className="tile-fx">
        {logo && <img src={logo} alt="" className="tile-ambient" loading="lazy" decoding="async" />}
        <span className="tile-glare" />
        {service.isFavorite && <span className="tile-holo" />}
      </span>

      {/* Logo + discreet status dot */}
      <span className="tile-logo pointer-events-none relative shrink-0">
        <span
          className={cx(
            'grid place-items-center overflow-hidden bg-background-tertiary-default/70',
            compact ? 'size-8 rounded-[9px]' : 'size-9 rounded-[10px]',
          )}
        >
          <LinkIcon service={service} size={compact ? 22 : 26} />
        </span>
        <span
          aria-hidden
          data-state={status}
          className={cx(
            'status-dot absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-background-secondary-default',
            offline ? 'bg-chart-3' : status === 'online' ? 'bg-chart-7' : 'bg-text-tertiary/60',
          )}
        />
      </span>

      {/* Name, then one line: always there (widget, outage) or on hover (host, latency) */}
      <span className={cx('pointer-events-none flex min-w-0 flex-1 flex-col justify-center', compact ? 'h-8' : 'h-9')}>
        <span
          className={cx(
            // On paper the letters may fall out of the line: don't clip them.
            paper ? 'overflow-visible whitespace-nowrap' : 'truncate',
            'text-body-semibold text-text-primary',
            service.isFavorite ? 'pr-6 group-hover:pr-14' : 'group-hover:pr-14',
          )}
        >
          {paper ? <WobbleText ref={wobble} text={service.name || 'Sans nom'} /> : service.name || 'Sans nom'}
        </span>
        {offline ? (
          <span className="tile-meta flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded-md bg-status-rose-background px-1.5 text-caption-1-medium text-status-rose-text">
              Hors ligne
            </span>
            <span className="min-w-0 truncate">{host}</span>
          </span>
        ) : live ? (
          <span className="tile-meta relative block h-4">
            <span className="absolute inset-0 truncate text-text-secondary transition-opacity duration-200 group-hover:opacity-0">
              {live.summary}
            </span>
            <span className="absolute inset-0 flex min-w-0 items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {meta}
            </span>
          </span>
        ) : repo || slow || dead ? (
          // The owner tells repositories apart; a slow service says so.
          <span className="tile-meta flex min-w-0 items-center gap-1.5">{meta}</span>
        ) : (
          <span className="tile-meta flex max-h-0 min-w-0 items-center gap-1.5 overflow-hidden opacity-0 transition-[max-height,opacity] duration-200 group-hover:max-h-4 group-hover:opacity-100 group-focus-within:max-h-4 group-focus-within:opacity-100">
            {meta}
          </span>
        )}
      </span>

      {!compact && <UptimeStrip health={health} />}

      {active && !offline && <span aria-hidden className="tile-beam" />}
      <UpdateBadge container={containerOf(service) ?? container?.name} />
      {celebrate && (
        <span aria-hidden className="tile-sparks">
          {Array.from({ length: 10 }, (_, k) => (
            <span key={k} style={{ '--a': `${k * 36}deg`, '--k': k } as React.CSSProperties} />
          ))}
        </span>
      )}

      {/* Turn the card over: QR code, address, notes */}
      <button
        type="button"
        onClick={e => {
          e.preventDefault();
          toggleFlipped(service.id);
        }}
        aria-label={`Retourner la carte ${service.name}`}
        title="Retourner la carte · F"
        className="absolute top-1.5 right-9 z-10 grid size-7 cursor-pointer place-items-center rounded-lg opacity-0 outline-none group-hover:opacity-100 hover:bg-background-tertiary-default focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <RiLoopLeftLine className="size-4 text-foreground-icon-secondary" aria-hidden />
      </button>

      {/* Favourite: its shortcut digit, the star on hover */}
      <button
        type="button"
        onClick={e => {
          e.preventDefault();
          if (!service.isFavorite) burst(e.currentTarget);
          onToggleFavorite();
        }}
        aria-pressed={service.isFavorite}
        aria-label={service.isFavorite ? `Retirer ${service.name} des favoris` : `Ajouter ${service.name} aux favoris`}
        title={service.isFavorite ? (digit ? `Favori · touche ${digit}` : 'Retirer des favoris') : 'Ajouter aux favoris'}
        className={cx(
          'absolute top-1.5 right-1.5 z-10 grid size-7 cursor-pointer place-items-center rounded-lg outline-none',
          'hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring',
          !service.isFavorite && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
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
    </div>
    {showBack && <TileBack service={service} open={flipped} onClose={closeBack} />}
    </>
  );
};

import React, { useEffect, useState } from 'react';
import { RiExternalLinkLine, RiStarFill, RiStarLine } from '@remixicon/react';
import { Service, ThemeConfig } from '../types';
import { LinkIcon } from './LinkIcon';
import { useDashboard } from '../store';
import { Chip, StatusDot } from './ui/badge';
import { cx } from '../utils/cx';

interface ServiceCardProps {
  service: Service;
  theme: ThemeConfig;
  listView?: boolean; // For admin preview
  onDetailsClick?: (service: Service) => void;
  /** Outline colour while the link is hovered in the tree. */
  highlightColor?: string | null;
}

const STATUS: Record<Service['status'], { dot: 'green' | 'red' | 'yellow' | 'neutral'; label: string }> = {
  online: { dot: 'green', label: 'En ligne' },
  offline: { dot: 'red', label: 'Hors ligne' },
  maintenance: { dot: 'yellow', label: 'Maintenance' },
  unknown: { dot: 'neutral', label: 'Inconnu' },
};

/** Latency sparkline on the chart tokens (line + soft area). */
const Sparkline: React.FC<{ data: number[]; offline: boolean }> = ({ data, offline }) => {
  const height = 24;
  const width = 100;
  const max = Math.max(...data, 10);
  if (data.length < 2) return null;

  const points = data
    .map((val, i) => `${(i / (data.length - 1)) * width},${height - (val / max) * height}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cx(
        'h-7 w-full opacity-60 transition-opacity group-hover:opacity-100',
        offline ? 'text-chart-3' : 'text-chart-highlight',
      )}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`M0,${height} L${points} L${width},${height} Z`} fill="currentColor" opacity="0.15" />
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={points} />
    </svg>
  );
};

export const ServiceCard: React.FC<ServiceCardProps> = ({ service, theme, listView = false, onDetailsClick, highlightColor }) => {
  const { toggleFavorite } = useDashboard();
  const [latencyHistory, setLatencyHistory] = useState<number[]>(new Array(10).fill(0));
  const [lastLatency, setLastLatency] = useState<number>(0);

  // Always use status from context (updated by store every 5 seconds)
  const liveStatus = service.status || 'unknown';

  useEffect(() => {
    if (listView) return;

    // Only track latency for online HTTP services
    const trackLatency = async () => {
      if (liveStatus === 'online' && (!service.stats?.dockerEnabled || !service.stats?.dockerContainer)) {
        try {
          const start = Date.now();
          await fetch(service.url, { cache: 'no-cache' });
          const latency = Date.now() - start;
          setLastLatency(latency);
          setLatencyHistory(prev => [...prev.slice(1), Math.min(latency, 100) + Math.random() * 20]);
        } catch (e) {
          setLastLatency(0);
          setLatencyHistory(prev => [...prev.slice(1), 0]);
        }
      }
    };

    trackLatency();
    const interval = setInterval(trackLatency, 15000);

    return () => clearInterval(interval);
  }, [service.url, liveStatus, service.stats?.dockerEnabled, service.stats?.dockerContainer, listView]);

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(service.url, service.openInNewTab ? '_blank' : '_self');
  };

  const padding = theme.density === 'compact' ? 'p-3' : theme.density === 'spacious' ? 'p-5' : 'p-4';
  const status = STATUS[liveStatus] ?? STATUS.unknown;

  return (
    <div
      role={listView ? undefined : 'button'}
      tabIndex={listView ? undefined : 0}
      aria-label={listView ? undefined : `${service.name}, ${status.label}. Voir les détails`}
      onClick={() => !listView && onDetailsClick?.(service)}
      onKeyDown={(e) => {
        if (!listView && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onDetailsClick?.(service);
        }
      }}
      className={cx(
        'group relative flex h-full min-h-[148px] flex-col gap-3 overflow-hidden rounded-3xl',
        'border border-border-button-default bg-background-secondary-default',
        'cursor-pointer transition-[border-color,background-color,transform] duration-200 ease-out',
        'hover:border-border-button-hover hover:bg-background-secondary-hover',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
        padding,
        listView && 'pointer-events-none w-full max-w-72',
        highlightColor && 'bg-background-secondary-hover',
      )}
      style={highlightColor ? { boxShadow: `0 0 0 2px ${highlightColor}`, borderColor: 'transparent' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-stat-card-icon-background text-foreground-icon-primary shadow-card">
          <LinkIcon service={service} size={theme.density === 'compact' ? 20 : 24} />
        </span>

        {!listView && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={open}
              aria-label={`Ouvrir ${service.name}`}
              title="Ouvrir"
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary opacity-0 transition-opacity outline-none group-hover:opacity-100 hover:bg-background-tertiary-default hover:text-foreground-icon-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <RiExternalLinkLine className="size-[18px]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(service.id);
              }}
              aria-pressed={service.isFavorite}
              aria-label={service.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              title={service.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={cx(
                'grid size-8 cursor-pointer place-items-center rounded-lg transition-opacity outline-none hover:bg-background-tertiary-default focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                service.isFavorite
                  ? 'text-chart-8'
                  : 'text-foreground-icon-secondary opacity-0 group-hover:opacity-100 hover:text-chart-8',
              )}
            >
              {service.isFavorite ? (
                <RiStarFill className="size-[18px]" aria-hidden />
              ) : (
                <RiStarLine className="size-[18px]" aria-hidden />
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <h3 className="truncate text-headline-medium text-text-primary">{service.name || 'Sans nom'}</h3>
        {theme.showDescriptions && service.description && (
          <p className="line-clamp-1 text-body-2-regular text-text-tertiary">{service.description}</p>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        {service.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {service.tags.slice(0, 3).map(tag => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-body-2-regular text-text-tertiary">
          <span className="flex items-center gap-1.5">
            <StatusDot color={status.dot} />
            {status.label}
          </span>
          {!listView && liveStatus === 'online' && lastLatency > 0 && (
            <span className="font-mono tabular-nums">{lastLatency} ms</span>
          )}
        </div>
        {!listView && (liveStatus === 'online' || liveStatus === 'offline') && lastLatency > 0 && (
          <Sparkline data={latencyHistory} offline={liveStatus === 'offline'} />
        )}
      </div>
    </div>
  );
};

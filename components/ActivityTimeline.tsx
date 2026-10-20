import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  RiAddLine,
  RiArrowGoBackLine,
  RiBrushLine,
  RiCloudLine,
  RiDeleteBin6Line,
  RiDownload2Line,
  RiEdit2Line,
  RiErrorWarningLine,
  RiFilmLine,
  RiLightbulbLine,
  RiPlayLine,
  RiRestartLine,
  RiStopLine,
} from '@remixicon/react';
import { auditApi, type TimelineEntry, type TimelineGroup } from '../api';
import { Panel } from './ui/panel';
import { SegmentedControl } from './ui/segmented-control';
import { Button } from './ui/button';
import type { IconComponent } from './ui/button';
import { cx } from '../utils/cx';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';

/**
 * System page → Historique: what was done from the portal (links and
 * folders, containers restarted / updated / cleaned, Home Assistant
 * commands, Nextcloud actions, Jellyseerr requests), newest first, by day.
 * Lines come from audit_logs, made readable by GET /api/audit/timeline.
 */

type Filter = 'all' | TimelineGroup;

const PAGE = 40;

const ICON: Record<string, IconComponent> = {
  create: RiAddLine,
  delete: RiDeleteBin6Line,
  update: RiEdit2Line,
  restart: RiRestartLine,
  stop: RiStopLine,
  start: RiPlayLine,
  prune: RiBrushLine,
  control: RiLightbulbLine,
  action: RiCloudLine,
  request: RiFilmLine,
  error: RiErrorWarningLine,
  restore: RiArrowGoBackLine,
};

const iconFor = (e: TimelineEntry) =>
  e.group === 'docker' && e.kind === 'update' ? RiDownload2Line : ICON[e.kind] ?? RiEdit2Line;

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Aujourd'hui";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Hier';
  const label = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function ActivityTimeline() {
  const [filter, setFilter] = useState<Filter>('all');
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Older pages are open: don't fold them back on the next refresh. */
  const extended = useRef(false);
  const { restoreServices } = useDashboard();
  const { notify } = useShell();
  const [restoring, setRestoring] = useState<string | null>(null);

  const restore = async (e: TimelineEntry) => {
    if (!e.restoreId || restoring) return;
    setRestoring(e.id);
    try {
      await restoreServices([e.restoreId]);
      notify(`${e.subject} restauré`, 'ok');
      extended.current = false;
      await loadFirst();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Restauration impossible', 'err');
    } finally {
      setRestoring(null);
    }
  };

  const group = filter === 'all' ? undefined : filter;

  const loadFirst = useCallback(async () => {
    try {
      const r = await auditApi.timeline({ limit: PAGE, group });
      setEntries(r.entries);
      setMore(r.more);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de lire l'historique");
    }
  }, [group]);

  useEffect(() => {
    setEntries(null);
    extended.current = false;
    void loadFirst();
    // New actions show up without reloading, unless older pages are open.
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !extended.current) void loadFirst();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [loadFirst]);

  const loadMore = async () => {
    if (!entries?.length || loadingMore) return;
    setLoadingMore(true);
    extended.current = true;
    try {
      const r = await auditApi.timeline({ limit: PAGE, group, before: entries[entries.length - 1].at });
      setEntries(cur => [...(cur ?? []), ...r.entries]);
      setMore(r.more);
    } catch {
      setMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // Consecutive entries of the same day share a heading.
  const days: { key: string; label: string; items: TimelineEntry[] }[] = [];
  for (const e of entries ?? []) {
    const key = dayKey(e.at);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(e);
    else days.push({ key, label: dayLabel(e.at), items: [e] });
  }

  return (
    <Panel
      title="Historique"
      subtitle="Ce qui a été fait depuis le portail"
      action={
        <SegmentedControl<Filter>
          label="Filtrer l'historique"
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: 'Tout' },
            { key: 'liens', label: 'Liens' },
            { key: 'docker', label: 'Serveur' },
            { key: 'maison', label: 'Maison' },
            { key: 'medias', label: 'Médias' },
          ]}
        />
      }
    >
      {error ? (
        <p className="text-body-2-regular text-text-error-primary">{error}</p>
      ) : !entries ? (
        <p className="text-body-2-regular text-text-tertiary">Chargement…</p>
      ) : !entries.length ? (
        <p className="text-body-2-regular text-text-tertiary">Rien pour l'instant.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map(day => (
            <div key={day.key} className="flex flex-col gap-1">
              <h3 className="text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">{day.label}</h3>
              <ol className="relative flex flex-col">
                {day.items.map((e, i) => {
                  const Icon = iconFor(e);
                  return (
                    <li key={e.id} className="relative grid grid-cols-[3rem_1.75rem_1fr_auto] items-start gap-x-2 py-1.5">
                      <time dateTime={e.at} className="pt-0.5 text-right text-body-2-regular text-text-tertiary tabular-nums">
                        {time(e.at)}
                      </time>
                      <span className="relative flex justify-center self-stretch">
                        {i < day.items.length - 1 && (
                          <span aria-hidden className="absolute top-7 -bottom-1.5 w-px bg-border-button-default" />
                        )}
                        <span
                          className={cx(
                            'relative grid size-6 place-items-center rounded-full border border-border-button-default bg-background-tertiary-default',
                            e.failed ? 'text-text-error-primary' : 'text-foreground-icon-tertiary',
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-col pt-0.5">
                        <span className="min-w-0 text-body-regular">
                          <span className={cx(e.failed ? 'text-text-error-primary' : 'text-text-secondary')}>{e.title}</span>
                          <span className="text-text-tertiary"> · </span>
                          <span className="font-medium text-text-primary break-words">{e.subject}</span>
                        </span>
                        {e.detail && <span className="truncate text-body-2-regular text-text-tertiary" title={e.detail}>{e.detail}</span>}
                      </span>
                      {e.restoreId ? (
                        <Button
                          variant="plain"
                          size="small"
                          leadingIcon={RiArrowGoBackLine}
                          disabled={restoring !== null}
                          onClick={() => void restore(e)}
                        >
                          {restoring === e.id ? 'Restauration…' : 'Restaurer'}
                        </Button>
                      ) : (
                        <span />
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          {more && (
            <div className="flex justify-center">
              <Button variant="plain" size="small" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Chargement…' : 'Voir plus'}
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

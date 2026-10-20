import React, { useEffect, useState } from 'react';
import { petApi } from '../api';
import { useShell } from '../lib/shell';
import { ACCESSORY_LABEL, type PetAccessory, type PetBadge, type PetEvent, type PetEventKind, type PetState, type Watching } from '../lib/pet';
import { cx } from '../utils/cx';

/**
 * The creature's card tabs (components/Pet.tsx):
 *  - PetWatching: what plays on Jellyfin, with it on the sofa;
 *  - PetJournal: its health book, the server's history as its life;
 *  - PetBadges: achievements, and the accessories they unlock.
 */

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  const day = days === 0 ? 'Aujourd’hui' : days === 1 ? 'Hier' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return { day: day.charAt(0).toUpperCase() + day.slice(1), time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) };
};

/* ---- En ce moment ------------------------------------------------------------ */

export function PetWatching({ watching }: { watching: Watching[] }) {
  if (!watching.length) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border-button-default p-2.5">
      <span className="text-caption-1-medium text-text-tertiary">📺 En ce moment sur Jellyfin</span>
      {watching.map(w => (
        <div key={`${w.user}${w.itemId}`} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-body-2-medium text-text-primary">
              {w.paused ? '⏸ ' : ''}
              {w.title}
            </span>
            <span className="shrink-0 text-caption-1-regular text-text-tertiary">{w.user}</span>
          </div>
          {w.subtitle && <span className="truncate text-caption-1-regular text-text-secondary">{w.subtitle}</span>}
          {w.progress !== null && (
            <span className="relative h-1 overflow-hidden rounded-full bg-chart-track" title={`${w.progress} % · ${w.device}`}>
              <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-chart-4)]" style={{ width: `${w.progress}%` }} />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---- Carnet de santé ------------------------------------------------------------ */

const KIND: Record<PetEventKind, { icon: string; tone: string }> = {
  birth: { icon: '🥚', tone: 'var(--color-chart-8)' },
  sick: { icon: '🤒', tone: 'var(--color-chart-3)' },
  healed: { icon: '🩹', tone: 'var(--color-chart-7)' },
  meal: { icon: '🍖', tone: 'var(--color-chart-8)' },
  indigestion: { icon: '🤢', tone: 'var(--color-chart-3)' },
  bath: { icon: '🛁', tone: 'var(--color-chart-4)' },
  dig: { icon: '🗑️', tone: 'var(--color-chart-5)' },
  evolve: { icon: '🌟', tone: 'var(--color-chart-8)' },
  badge: { icon: '🏆', tone: 'var(--color-chart-8)' },
  movie: { icon: '🍿', tone: 'var(--color-chart-5)' },
};

const FILTERS: { key: string; label: string; kinds: PetEventKind[] | null }[] = [
  { key: 'all', label: 'Tout', kinds: null },
  { key: 'health', label: '🤒 Santé', kinds: ['sick', 'healed'] },
  { key: 'care', label: '🍖 Soins', kinds: ['meal', 'indigestion', 'bath', 'dig'] },
  { key: 'life', label: '🌟 Vie', kinds: ['birth', 'evolve', 'badge'] },
  { key: 'tv', label: '🍿 Télé', kinds: ['movie'] },
];

export function PetJournal() {
  const [events, setEvents] = useState<PetEvent[] | null>(null);
  const [more, setMore] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(false);

  useEffect(() => {
    petApi
      .journal()
      .then(e => {
        setEvents(e);
        setMore(e.length >= 60);
      })
      .catch(() => setError(true));
  }, []);

  const loadMore = async () => {
    const last = events?.[events.length - 1];
    if (!last) return;
    const next = await petApi.journal(last.id).catch(() => []);
    setEvents(e => [...(e ?? []), ...next]);
    setMore(next.length >= 60);
  };

  if (error) return <p className="py-6 text-center text-body-2-regular text-text-tertiary">Carnet introuvable 😿</p>;
  if (!events) return <p className="py-6 text-center text-body-2-regular text-text-tertiary">Je cherche mon carnet…</p>;

  const kinds = FILTERS.find(f => f.key === filter)?.kinds;
  const shown = kinds ? events.filter(e => kinds.includes(e.kind)) : events;
  let lastDay = '';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cx('pet-chip', filter === f.key && 'is-on')}>
            {f.label}
          </button>
        ))}
      </div>
      <ol className="pet-timeline flex flex-col">
        {shown.map(e => {
          const { day, time } = when(e.at);
          const head = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={e.id}>
              {head && <li className="pt-2 pb-1 text-caption-1-medium text-text-tertiary">{day}</li>}
              <li className="pet-ev relative flex gap-2.5 py-1.5 pl-1">
                <span className="pet-dot relative z-[1] grid size-6 shrink-0 place-items-center rounded-full text-[13px]" style={{ background: `color-mix(in oklch, ${KIND[e.kind]?.tone ?? 'gray'} 22%, var(--color-background-secondary-default))` }}>
                  {KIND[e.kind]?.icon ?? '•'}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-2-medium text-text-primary">{e.title}</span>
                  <span className="text-caption-1-regular text-text-tertiary">
                    {time}
                    {e.detail ? ` · ${e.detail}` : ''}
                  </span>
                </span>
              </li>
            </React.Fragment>
          );
        })}
        {!shown.length && <li className="py-6 text-center text-body-2-regular text-text-tertiary">Rien à raconter ici pour l’instant</li>}
      </ol>
      {more && (
        <button type="button" onClick={loadMore} className="pet-btn self-center">
          Plus ancien
        </button>
      )}
    </div>
  );
}

/* ---- Succès ------------------------------------------------------------------ */

export function PetBadges({ pet, onPet }: { pet: PetState; onPet: (p: PetState) => void }) {
  const { notify } = useShell();
  const [badges, setBadges] = useState<PetBadge[] | null>(null);
  useEffect(() => {
    petApi.badges().then(setBadges).catch(() => setBadges([]));
  }, []);

  const wear = async (a: PetAccessory | null) => {
    try {
      onPet(await petApi.wear(a));
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Impossible', 'err');
    }
  };

  if (!badges) return <p className="py-6 text-center text-body-2-regular text-text-tertiary">Je compte mes trophées…</p>;
  const got = badges.filter(b => b.unlockedAt).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-caption-1-medium text-text-tertiary">
        <span>
          {got} / {badges.length} débloqués
        </span>
        {pet.accessory && (
          <button type="button" className="pet-chip" onClick={() => wear(null)}>
            Retirer {ACCESSORY_LABEL[pet.accessory].toLowerCase()}
          </button>
        )}
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {badges.map(b => {
          const on = !!b.unlockedAt;
          const worn = b.accessory && pet.accessory === b.accessory;
          return (
            <li key={b.key} className={cx('pet-badge flex flex-col gap-1 rounded-2xl border p-2', on ? 'border-border-button-default' : 'is-locked border-transparent')} title={b.description}>
              <span className="flex items-center gap-1.5">
                <span className="text-[18px]" aria-hidden>
                  {on ? b.icon : '🔒'}
                </span>
                <span className="min-w-0 text-caption-1-medium leading-tight text-text-primary">{b.label}</span>
              </span>
              <span className="text-caption-1-regular leading-tight text-text-tertiary">
                {on ? new Date(b.unlockedAt!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : b.description}
              </span>
              {!on && b.progress && (
                <span className="relative h-1 overflow-hidden rounded-full bg-chart-track" title={`${b.progress.value} / ${b.progress.goal}`}>
                  <span className="pet-xp absolute inset-y-0 left-0 rounded-full" style={{ width: `${(b.progress.value / b.progress.goal) * 100}%` }} />
                </span>
              )}
              {b.accessory && (
                <button
                  type="button"
                  disabled={!on}
                  onClick={() => wear(worn ? null : b.accessory)}
                  className={cx('pet-chip mt-0.5 self-start', worn && 'is-on')}
                  title={on ? undefined : 'À débloquer'}
                >
                  {worn ? '✓ Porté' : `🎁 ${ACCESSORY_LABEL[b.accessory]}`}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

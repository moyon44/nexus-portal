import React, { useEffect, useState } from 'react';
import { RiArrowUpLine, RiLoader4Line } from '@remixicon/react';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import { cx } from '../utils/cx';

/**
 * Small pill on a tile whose container has a newer image (or already
 * pulled a newer one it doesn't run yet). First click asks, second click
 * updates (pull + recreate, backend services/updates.ts); while it runs
 * the pill spins with the current step as tooltip.
 */
export const UpdateBadge: React.FC<{ container: string | null | undefined }> = ({ container }) => {
  const { data, updateContainer } = useDashboard();
  const { notify } = useShell();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const t = window.setTimeout(() => setAsking(false), 4000);
    return () => window.clearTimeout(t);
  }, [asking]);

  if (!container) return null;
  const info = data.updates.containers[container];
  const job = data.updates.jobs[container];
  const running = job && !job.endedAt;
  if (!running && !(info && (info.state === 'available' || info.state === 'recreate'))) return null;

  const others = info?.dependents ?? [];
  const title = running
    ? job.step
    : [
        info.state === 'recreate' ? 'Nouvelle image déjà téléchargée : redémarrer dessus' : `Mise à jour disponible · ${info.image}`,
        others.length ? `Recrée aussi : ${others.join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

  return (
    <button
      type="button"
      title={title}
      aria-label={running ? `Mise à jour de ${container} en cours` : `Mettre à jour ${container}`}
      disabled={running}
      onClick={async e => {
        e.preventDefault();
        e.stopPropagation();
        if (!asking) return setAsking(true);
        setAsking(false);
        try {
          await updateContainer(container);
          notify(`Mise à jour de ${container} lancée${others.length ? ` (+ ${others.length} liés)` : ''}`, 'info');
        } catch (err) {
          notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'err');
        }
      }}
      className={cx(
        'update-badge absolute -top-2 left-3 z-10 flex h-[18px] cursor-pointer items-center gap-1 rounded-full px-1.5 text-[10px] leading-none font-bold tracking-wide uppercase outline-none',
        'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
        running ? 'is-running' : asking ? 'is-asking' : '',
      )}
    >
      {running ? (
        <>
          <RiLoader4Line className="size-3 animate-spin" aria-hidden />
          {job.status === 'pulling' ? 'Téléchargement' : job.status === 'queued' ? 'En attente' : 'Recréation'}
        </>
      ) : asking ? (
        <>
          <RiArrowUpLine className="size-3" aria-hidden />
          {others.length ? `Mettre à jour (+${others.length}) ?` : 'Mettre à jour ?'}
        </>
      ) : (
        <>
          <RiArrowUpLine className="size-3" aria-hidden />
          MAJ
        </>
      )}
    </button>
  );
};

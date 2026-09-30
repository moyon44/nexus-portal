import React, { useEffect, useMemo, useState } from 'react';
import { RiArrowUpLine, RiBrushLine, RiCheckLine, RiLoader4Line, RiRefreshLine } from '@remixicon/react';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import { maintenanceApi } from '../api';
import { containerOf } from '../lib/actions';
import type { PrunePreview, Service, UpdateState } from '../types';
import { Panel } from './ui/panel';
import { Button } from './ui/button';
import { Checkbox } from './ui/form';
import { LinkIcon } from './LinkIcon';
import { cx } from '../utils/cx';
import { petReact } from './Pet';
import { updateQueue } from '../lib/updates';

/**
 * System page → Maintenance:
 *  - Mises à jour: which containers have a newer image (checked every 12 h,
 *    or now), update one or all. The portal's own containers and locally
 *    built images are listed but can't be updated from here.
 *  - Nettoyage: what `docker … prune` would free, per kind, and do it.
 *    Named volumes are never removed.
 */

const bytes = (n: number) => {
  if (!n) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[i]}`;
};

const ago = (t: number | null) => {
  if (!t) return 'jamais';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
};

const LABEL: Record<UpdateState, string> = {
  available: 'Mise à jour dispo',
  recreate: 'À redémarrer sur la nouvelle image',
  current: 'À jour',
  local: 'Image locale',
  self: 'Le portail',
  error: 'Vérification impossible',
};

function Updates() {
  const { data, updateContainer, checkUpdates } = useDashboard();
  const { notify } = useShell();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { containers, jobs, checkedAt, checking } = data.updates;

  const tileFor = useMemo(() => {
    const map = new Map<string, Service>();
    for (const s of data.services) {
      const c = containerOf(s) ?? data.health[s.id]?.container?.name;
      if (c && !map.has(c)) map.set(c, s);
    }
    return map;
  }, [data.services, data.health]);

  const list = Object.values(containers);
  const pending = list.filter(c => c.state === 'available' || c.state === 'recreate');
  // Up-to-date ones fold away; running or failed jobs stay in view.
  const others = list
    .filter(c => !pending.includes(c))
    .sort((a, b) => a.container.localeCompare(b.container))
    .filter(c => showAll || jobs[c.container]);
  const running = Object.values(jobs).some(j => !j.endedAt);

  const ask = (key: string, run: () => void) => {
    if (confirm !== key) {
      setConfirm(key);
      window.setTimeout(() => setConfirm(k => (k === key ? null : k)), 4000);
      return;
    }
    setConfirm(null);
    run();
  };

  const start = (name: string) =>
    updateContainer(name).catch(err => notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'err'));

  const all = () => {
    const queue = updateQueue(pending);
    queue.forEach(p => void start(p.container));
    notify(`${queue.length} mise${queue.length > 1 ? 's' : ''} à jour lancée${queue.length > 1 ? 's' : ''}`, 'info');
  };

  return (
    <Panel
      title="Mises à jour"
      subtitle={`${pending.length ? `${pending.length} disponible${pending.length > 1 ? 's' : ''}` : 'Tout est à jour'} · vérifié ${ago(checkedAt)}`}
      action={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="small" leadingIcon={checking ? RiLoader4Line : RiRefreshLine} iconClassName={checking ? 'animate-spin' : undefined} disabled={checking} onClick={() => void checkUpdates()}>
            {checking ? 'Vérification…' : 'Vérifier'}
          </Button>
          {pending.length > 1 && (
            <Button size="small" leadingIcon={RiArrowUpLine} disabled={running} onClick={() => ask('all', all)}>
              {confirm === 'all' ? 'Confirmer ?' : 'Tout mettre à jour'}
            </Button>
          )}
        </div>
      }
    >
      <ul className="flex flex-col divide-y divide-separator-border">
        {[...pending, ...others].map(c => {
          const job = jobs[c.container];
          const live = job && !job.endedAt;
          const tile = tileFor.get(c.container);
          const can = c.state === 'available' || c.state === 'recreate';
          return (
            <li key={c.container} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background-tertiary-default">
                {tile ? <LinkIcon service={tile} size={20} /> : <span className="text-caption-1-medium text-text-tertiary">{c.container.slice(0, 2)}</span>}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-medium text-text-primary">{c.container}</span>
                <span className="truncate font-mono text-caption-1-regular text-text-tertiary">
                  {live ? job.step : job?.status === 'failed' ? `Échec : ${job.error}` : c.image}
                  {!live && c.dependents.length > 0 && can ? ` · recrée aussi ${c.dependents.join(', ')}` : ''}
                </span>
              </span>
              {live ? (
                <span className="flex items-center gap-1.5 text-caption-1-medium text-accent-400">
                  <RiLoader4Line className="size-4 animate-spin" aria-hidden />
                  {job.status === 'pulling' ? 'Téléchargement' : job.status === 'queued' ? 'En attente' : 'Recréation'}
                </span>
              ) : can ? (
                <Button size="small" variant={confirm === c.container ? 'primary' : 'secondary'} leadingIcon={RiArrowUpLine} onClick={() => ask(c.container, () => void start(c.container))}>
                  {confirm === c.container ? (c.dependents.length ? `Confirmer (+${c.dependents.length})` : 'Confirmer') : 'Mettre à jour'}
                </Button>
              ) : (
                <span
                  title={c.error}
                  className={cx(
                    'flex items-center gap-1 text-caption-1-medium',
                    c.state === 'current' ? 'text-status-lime-text' : 'text-text-tertiary',
                  )}
                >
                  {c.state === 'current' && <RiCheckLine className="size-4" aria-hidden />}
                  {LABEL[c.state]}
                </span>
              )}
            </li>
          );
        })}
        {list.length > pending.length && (
          <li className="pt-2.5">
            <button type="button" onClick={() => setShowAll(v => !v)} className="cursor-pointer text-body-2-medium text-text-tertiary hover:text-text-primary">
              {showAll ? 'Masquer les autres conteneurs' : `Voir les ${list.length - pending.length} autres conteneurs (à jour, images locales, portail)`}
            </button>
          </li>
        )}
        {!list.length && <li className="py-6 text-center text-body-2-regular text-text-tertiary">{checking ? 'Vérification des registres…' : 'Pas encore vérifié. Clique sur « Vérifier ».'}</li>}
      </ul>
    </Panel>
  );
}

type Kind = 'containers' | 'dangling' | 'unused' | 'networks' | 'buildCache' | 'volumes';

function Cleanup() {
  const { notify } = useShell();
  const [preview, setPreview] = useState<PrunePreview | null>(null);
  const [pick, setPick] = useState<Record<Kind, boolean>>({ containers: true, dangling: true, unused: false, networks: true, buildCache: true, volumes: false });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => maintenanceApi.prunePreview().then(setPreview).catch(() => setPreview(null));
  useEffect(() => {
    load();
  }, []);

  const rows: { key: Kind; label: string; hint: string; count: number; size?: number; warn?: boolean }[] = preview
    ? [
        { key: 'containers', label: 'Conteneurs arrêtés', hint: preview.containers.names.join(', ') || 'Aucun', count: preview.containers.count, size: preview.containers.bytes },
        { key: 'dangling', label: 'Images orphelines', hint: 'Anciennes versions sans étiquette, laissées par les mises à jour', count: preview.dangling.count, size: preview.dangling.bytes },
        { key: 'unused', label: 'Toutes les images inutilisées', hint: 'Aussi celles qu’aucun conteneur n’utilise : elles seront retéléchargées si besoin', count: preview.unused.count, size: preview.unused.bytes },
        { key: 'networks', label: 'Réseaux inutilisés', hint: 'Réseaux créés par des stacks supprimées', count: preview.networks.count },
        { key: 'buildCache', label: 'Cache de build', hint: 'Couches gardées par docker build', count: preview.buildCache.count, size: preview.buildCache.bytes },
        {
          key: 'volumes',
          label: 'Volumes anonymes inutilisés',
          hint: `Jamais les volumes nommés (${preview.volumes.named} inutilisés conservés)`,
          count: preview.volumes.count,
          size: preview.volumes.bytes,
          warn: true,
        },
      ]
    : [];

  const images = pick.unused ? preview?.unused.bytes ?? 0 : pick.dangling ? preview?.dangling.bytes ?? 0 : 0;
  const total =
    images +
    (pick.containers ? preview?.containers.bytes ?? 0 : 0) +
    (pick.buildCache ? preview?.buildCache.bytes ?? 0 : 0) +
    (pick.volumes ? preview?.volumes.bytes ?? 0 : 0);
  const any = Object.values(pick).some(Boolean);

  const run = async () => {
    if (!confirm) {
      setConfirm(true);
      window.setTimeout(() => setConfirm(false), 4000);
      return;
    }
    setConfirm(false);
    setBusy(true);
    try {
      const r = await maintenanceApi.prune({
        containers: pick.containers,
        images: pick.unused ? 'unused' : pick.dangling ? 'dangling' : false,
        networks: pick.networks,
        buildCache: pick.buildCache,
        volumes: pick.volumes,
      });
      notify(`Nettoyage terminé : ${bytes(r.total)} libérés`, 'ok');
      petReact('bath');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Nettoyage impossible', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Nettoyage"
      subtitle={preview ? `Jusqu’à ${bytes(total)} à libérer avec la sélection` : 'Analyse…'}
      action={
        <Button size="small" variant={confirm ? 'danger' : 'primary'} leadingIcon={busy ? RiLoader4Line : RiBrushLine} iconClassName={busy ? 'animate-spin' : undefined} disabled={!any || busy || !preview} onClick={run}>
          {busy ? 'Nettoyage…' : confirm ? 'Confirmer le nettoyage' : 'Nettoyer'}
        </Button>
      }
    >
      <ul className="flex flex-col divide-y divide-separator-border">
        {rows.map(r => (
          <li key={r.key} className="flex items-center gap-3 py-2.5">
            <Checkbox
              checked={pick[r.key]}
              onChange={v => setPick(p => ({ ...p, [r.key]: v, ...(r.key === 'unused' && v ? { dangling: true } : {}) }))}
              label={
                <span className="flex flex-col">
                  <span className={cx('text-body-medium', r.warn && pick[r.key] ? 'text-status-yellow-text' : 'text-text-primary')}>{r.label}</span>
                  <span className="text-caption-1-regular text-text-tertiary">{r.hint}</span>
                </span>
              }
            />
            <span className="ml-auto shrink-0 text-right text-body-2-medium text-text-secondary tabular-nums">
              {r.count} {r.size !== undefined && <span className="text-text-tertiary">· {bytes(r.size)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export const Maintenance: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_2fr]">
    <Updates />
    <Cleanup />
  </div>
);

import React, { useEffect, useMemo, useState } from 'react';
import { RiHomeWifiLine, RiPlayLine, RiRestartLine, RiStopLine } from '@remixicon/react';
import { dockerApi } from '../api';
import { useDashboard } from '../store';
import { useSystemStats } from '../hooks/useSystemStats';
import { useShell } from '../lib/shell';
import { containerOf } from '../lib/actions';
import type { ContainerOverview, Service } from '../types';
import { PageHeader, Panel } from '../components/ui/panel';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Button, ButtonLink } from '../components/ui/button';
import { AreaChart } from '../components/ui/area-chart';
import { Sparkline } from '../components/ui/sparkline';
import { Rail, usageTone, TONE_TEXT } from '../components/ui/widget';
import { LinkIcon } from '../components/LinkIcon';
import { Roll } from '../components/ui/roll';
import { cx } from '../utils/cx';
import { Maintenance } from '../components/Maintenance';
import { ActivityTimeline } from '../components/ActivityTimeline';

/**
 * System page: the host (CPU / RAM over an hour, disk), maintenance (image
 * updates, cleanup: components/Maintenance.tsx) and every container with
 * its own CPU / RAM trend, the heaviest first, with start / stop / restart.
 * Stop and restart ask for a second click. Then the action history
 * (components/ActivityTimeline.tsx). Home Assistant's sensors have
 * their own page (pages/HomeAssistant.tsx).
 */

type Sort = 'cpu' | 'ram' | 'name';

const bytes = (n: number) => {
  if (!n) return '–';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[i]}`;
};

const uptime = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d ? `${d} j ${h} h` : `${h} h`;
};

function HostCard({ title, value, detail, children }: { title: string; value: number; detail?: string; children: React.ReactNode }) {
  const tone = usageTone(value);
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">{title}</h2>
        {detail && <span className="truncate text-body-2-regular text-text-tertiary">{detail}</span>}
      </div>
      <p className={cx('text-display-4-regular tracking-tight tabular-nums', tone === 'ok' ? 'text-text-primary' : TONE_TEXT[tone])}>
        <Roll value={Math.round(value)} />
        <span className="text-body-regular text-text-tertiary"> %</span>
      </p>
      {children}
    </Panel>
  );
}

export const System: React.FC = () => {
  const { data } = useDashboard();
  const { notify } = useShell();
  const { stats } = useSystemStats(true);
  const [containers, setContainers] = useState<ContainerOverview[] | null>(null);
  const [sort, setSort] = useState<Sort>('cpu');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = () =>
    dockerApi
      .getOverview()
      .then(setContainers)
      .catch(() => setContainers([]));

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  // Tiles bound to a container lend it their logo and name.
  const tileFor = useMemo(() => {
    const map = new Map<string, Service>();
    for (const s of data.services) {
      const c = containerOf(s);
      if (c && !map.has(c)) map.set(c, s);
    }
    return map;
  }, [data.services]);

  const sorted = useMemo(() => {
    const list = [...(containers ?? [])];
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => b[sort] - a[sort] || a.name.localeCompare(b.name));
    return list;
  }, [containers, sort]);

  const running = containers?.filter(c => c.state === 'running').length ?? 0;

  const act = async (c: ContainerOverview, action: 'restart' | 'stop' | 'start') => {
    const key = `${action}-${c.name}`;
    if (action !== 'start' && confirm !== key) {
      setConfirm(key);
      window.setTimeout(() => setConfirm(k => (k === key ? null : k)), 4000);
      return;
    }
    setConfirm(null);
    setBusy(c.name);
    try {
      if (action === 'restart') await dockerApi.restartContainer(c.name);
      if (action === 'stop') await dockerApi.stopContainer(c.name);
      if (action === 'start') await dockerApi.startContainer(c.name);
      notify(`${c.name} : ${action === 'restart' ? 'redémarré' : action === 'stop' ? 'arrêté' : 'démarré'}`, 'ok');
      window.setTimeout(load, 1500);
    } catch {
      notify(`Action impossible sur ${c.name}`, 'err');
    } finally {
      setBusy(null);
    }
  };

  const history = stats?.history ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Système"
        subtitle={
          stats
            ? `${stats.cpu.model} · ${stats.cpu.count} cœurs · en ligne depuis ${uptime(stats.uptime)}`
            : 'Serveur et conteneurs'
        }
        actions={
          <ButtonLink variant="secondary" size="small" href="#/systeme/home-assistant" leadingIcon={RiHomeWifiLine}>
            Home Assistant
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <HostCard title="Processeur" value={stats?.cpu.usage ?? 0} detail="sur une heure">
          <AreaChart points={history.map(h => ({ t: h.t, v: h.cpu }))} label="CPU" />
        </HostCard>
        <HostCard
          title="Mémoire"
          value={stats?.memory.usage ?? 0}
          detail={stats ? `${bytes(stats.memory.used)} / ${bytes(stats.memory.total)}` : undefined}
        >
          <AreaChart points={history.map(h => ({ t: h.t, v: h.ram }))} label="RAM" />
        </HostCard>
        <HostCard title="Disque" value={stats?.disk.usage ?? 0} detail={stats ? `${bytes(stats.disk.free)} libres` : undefined}>
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <Rail pct={stats?.disk.usage ?? 0} tone={usageTone(stats?.disk.usage ?? 0)} />
            <p className="text-body-2-regular text-text-tertiary">
              {stats ? `${bytes(stats.disk.used)} utilisés sur ${bytes(stats.disk.total)}` : ''}
            </p>
          </div>
        </HostCard>
      </div>

      <Maintenance />

      <Panel
        title="Conteneurs"
        subtitle={containers ? `${running} en marche sur ${containers.length} · mesures toutes les 30 s` : 'Chargement…'}
        action={
          <SegmentedControl<Sort>
            label="Trier par"
            value={sort}
            onChange={setSort}
            options={[
              { key: 'cpu', label: 'CPU' },
              { key: 'ram', label: 'RAM' },
              { key: 'name', label: 'Nom' },
            ]}
          />
        }
      >
        <div className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="bui-table min-w-[720px]">
            <thead>
              <tr>
                <th>Conteneur</th>
                <th className="w-44">CPU</th>
                <th className="w-52">RAM</th>
                <th>État</th>
                <th className="w-40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const tile = tileFor.get(c.name);
                const up = c.state === 'running';
                return (
                  <tr key={c.name}>
                    <td>
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background-tertiary-default/70">
                          <LinkIcon service={tile ?? { name: c.name, icon: 'lucide:box' }} size={20} />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-body-medium text-text-primary">{tile?.name ?? c.name}</span>
                          <span className="truncate text-body-2-regular text-text-tertiary">
                            {tile ? `${c.name} · ` : ''}
                            {c.image}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-right whitespace-nowrap tabular-nums">{up ? `${c.cpu.toLocaleString('fr-FR')} %` : '–'}</span>
                        {up && <Sparkline values={c.history.map(h => h.cpu)} max={Math.max(100, ...c.history.map(h => h.cpu))} label={`CPU de ${c.name} sur une heure`} />}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-right whitespace-nowrap tabular-nums">{up ? `${c.ram.toLocaleString('fr-FR')} %` : '–'}</span>
                        {up && (
                          <span className="text-body-2-regular text-text-tertiary tabular-nums">{bytes(c.ramUsed)}</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-2 text-body-2-regular">
                        <span className={cx('size-2 rounded-full', up ? 'bg-chart-7' : 'bg-chart-3')} aria-hidden />
                        <span className={up ? 'text-text-secondary' : 'text-status-rose-text'}>{c.status}</span>
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        {up ? (
                          <>
                            <Button
                              variant="plain"
                              size="small"
                              leadingIcon={RiRestartLine}
                              disabled={busy === c.name}
                              onClick={() => act(c, 'restart')}
                              className={confirm === `restart-${c.name}` ? 'text-text-error-primary' : undefined}
                            >
                              {confirm === `restart-${c.name}` ? 'Confirmer' : 'Redémarrer'}
                            </Button>
                            <Button
                              variant="plain"
                              size="small"
                              iconOnly={confirm !== `stop-${c.name}`}
                              leadingIcon={RiStopLine}
                              aria-label={`Arrêter ${c.name}`}
                              title="Arrêter"
                              disabled={busy === c.name}
                              onClick={() => act(c, 'stop')}
                              className={confirm === `stop-${c.name}` ? 'text-text-error-primary' : undefined}
                            >
                              {confirm === `stop-${c.name}` ? 'Arrêter ?' : undefined}
                            </Button>
                          </>
                        ) : (
                          <Button variant="plain" size="small" leadingIcon={RiPlayLine} disabled={busy === c.name} onClick={() => act(c, 'start')}>
                            Démarrer
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <ActivityTimeline />
    </div>
  );
};

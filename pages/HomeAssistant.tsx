import React, { useEffect, useMemo, useState } from 'react';
import { RiArrowLeftLine, RiLayoutTop2Line, RiPushpinFill, RiPushpinLine, RiSearchLine } from '@remixicon/react';
import { haApi, integrationsApi } from '../api';
import { useShell } from '../lib/shell';
import type { HaEntity } from '../types';
import { PageHeader, Panel } from '../components/ui/panel';
import { SegmentedControl } from '../components/ui/segmented-control';
import { ButtonLink } from '../components/ui/button';
import { Input, Switch } from '../components/ui/form';
import { cx } from '../utils/cx';
import { DEAD, ago, formatValue } from '../lib/ha';

/**
 * Système → Home Assistant: every sensor the house reports, grouped by room,
 * with a search. The pin puts one on the Home Assistant tile (in pin order);
 * the tile shows the first three values and the rest in its details. The
 * second button puts up to four in the status bar, in place of the city
 * weather (a weather entity shows as the outside).
 * Refreshed every 30 s.
 */

type Kind = 'sensor' | 'binary_sensor' | 'all';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const HomeAssistant: React.FC = () => {
  const { notify } = useShell();
  const [entities, setEntities] = useState<HaEntity[] | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [bar, setBar] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('sensor');
  const [hideDead, setHideDead] = useState(true);

  useEffect(() => {
    const load = () =>
      integrationsApi
        .haEntities()
        .then(r => {
          setEntities(r.entities);
          setPinned(r.pinned);
          setError(null);
        })
        .catch(e => setError(e instanceof Error ? e.message : 'Home Assistant indisponible'));
    load();
    haApi.statusbar().then(items => setBar(items.map(i => i.id))).catch(() => undefined);
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const byId = useMemo(() => new Map((entities ?? []).map(e => [e.id, e])), [entities]);

  const groups = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const list = (entities ?? []).filter(e => {
      const domain = e.domain === 'weather' ? 'sensor' : e.domain;
      if (kind === 'all' ? !['sensor', 'binary_sensor'].includes(domain) && !words.length : domain !== kind) return false;
      if (hideDead && DEAD.has(e.state)) return false;
      const hay = normalize(`${e.name} ${e.id} ${e.area ?? ''}`);
      return words.every(w => hay.includes(w));
    });
    const map = new Map<string, HaEntity[]>();
    for (const e of list) {
      const k = e.area ?? '';
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a ? (b ? a.localeCompare(b) : -1) : 1))
      .map(([area, items]) => ({ area: area || 'Sans pièce', items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [entities, query, kind, hideDead]);

  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  const togglePin = async (id: string) => {
    const before = pinned;
    const next = pinned.includes(id) ? pinned.filter(p => p !== id) : [...pinned, id];
    setPinned(next);
    try {
      const r = await integrationsApi.haPin(next);
      notify(r.ok ? `Tuile Home Assistant : ${r.summary}` : r.error ?? 'Tuile mise à jour', r.ok ? 'ok' : 'err');
    } catch (e) {
      setPinned(before);
      notify(e instanceof Error ? e.message : 'Enregistrement impossible', 'err');
    }
  };

  const toggleBar = async (id: string) => {
    const before = bar;
    if (!bar.includes(id) && bar.length >= 4) {
      notify('4 au maximum dans la barre de statut : retires-en un d’abord', 'err');
      return;
    }
    const next = bar.includes(id) ? bar.filter(p => p !== id) : [...bar, id];
    setBar(next);
    try {
      await haApi.setStatusbar(next);
      notify(next.length ? 'Barre de statut mise à jour (recharge l’accueil)' : 'Barre de statut : retour à la météo de la ville', 'ok');
    } catch (e) {
      setBar(before);
      notify(e instanceof Error ? e.message : 'Enregistrement impossible', 'err');
    }
  };

  const sensors = entities?.filter(e => e.domain === 'sensor') ?? [];
  const rooms = new Set(sensors.map(e => e.area).filter(Boolean)).size;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Home Assistant"
        subtitle={
          entities
            ? `${sensors.filter(e => !DEAD.has(e.state)).length} capteurs actifs sur ${sensors.length} · ${rooms} pièces · actualisé toutes les 30 s`
            : 'Capteurs de la maison'
        }
        actions={
          <ButtonLink variant="secondary" size="small" href="#/systeme" leadingIcon={RiArrowLeftLine}>
            Système
          </ButtonLink>
        }
      />

      {error ? (
        <Panel>
          <p className="text-body-regular text-text-error-primary">{error}</p>
        </Panel>
      ) : !entities ? (
        <p className="text-body-regular text-text-tertiary">Chargement…</p>
      ) : (
        <>
          <Panel
            title="Sur la tuile"
            subtitle={pinned.length ? 'Les trois premiers s’affichent sur la tuile, les autres au survol. Clique pour retirer.' : 'Épingle des capteurs ci-dessous pour les voir sur la tuile Home Assistant.'}
          >
            {pinned.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pinned.map((id, i) => {
                  const e = byId.get(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => togglePin(id)}
                      title="Retirer de la tuile"
                      className={cx(
                        'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-body-2-regular',
                        i < 3 ? 'border-accent-400 text-text-primary' : 'border-border-button-default text-text-secondary',
                      )}
                    >
                      <RiPushpinFill className="size-3.5 text-accent-400" aria-hidden />
                      <span className="max-w-[16rem] truncate">{e?.name ?? id}</span>
                      {e && <span className="tabular-nums text-text-tertiary">{formatValue(e)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title="Barre de statut"
            subtitle={
              bar.length
                ? 'À la place de la météo de la ville, dans cet ordre. Une entité météo s’affiche comme « dehors ». Clique pour retirer.'
                : 'Choisis jusqu’à 4 capteurs avec le bouton ▭ pour remplacer la météo de la ville (par exemple la météo Home Assistant, puis la température et l’humidité du salon).'
            }
          >
            {bar.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {bar.map(id => {
                  const e = byId.get(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleBar(id)}
                      title="Retirer de la barre de statut"
                      className="flex cursor-pointer items-center gap-2 rounded-full border border-accent-400 px-3 py-1 text-body-2-regular text-text-primary"
                    >
                      <RiLayoutTop2Line className="size-3.5 text-accent-400" aria-hidden />
                      <span className="max-w-[16rem] truncate">{e?.name ?? id}</span>
                      {e && <span className="tabular-nums text-text-tertiary">{formatValue(e)}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Panel>

          <div className="flex flex-wrap items-end gap-3">
            <Input
              className="min-w-[14rem] flex-1"
              leadingIcon={RiSearchLine}
              placeholder="Pièce, nom ou entité (salon, température, voiture…)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Rechercher un capteur"
            />
            <SegmentedControl<Kind>
              label="Type"
              value={kind}
              onChange={setKind}
              options={[
                { key: 'sensor', label: 'Capteurs' },
                { key: 'binary_sensor', label: 'États' },
                { key: 'all', label: 'Tout' },
              ]}
            />
            <Switch checked={hideDead} onChange={setHideDead} label="Masquer les indisponibles" />
          </div>

          <p className="-mt-3 text-body-2-regular text-text-tertiary">
            {shown} résultat{shown > 1 ? 's' : ''}
            {kind === 'all' && !query.trim() ? ' · tape une recherche pour voir aussi les lumières, volets, radiateurs…' : ''}
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {groups.map(g => (
              <React.Fragment key={g.area}>
              <Panel title={g.area} subtitle={`${g.items.length} élément${g.items.length > 1 ? 's' : ''}`}>
                <ul className="flex flex-col divide-y divide-separator-border">
                  {g.items.map(e => {
                    const on = pinned.includes(e.id);
                    return (
                      <li key={e.id} className="flex items-center gap-3 py-2">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-body-medium text-text-primary">{e.name}</span>
                          <span className="truncate font-mono text-caption-1-regular text-text-tertiary">
                            {e.id} · {ago(e.changed)}
                          </span>
                        </span>
                        <span className={cx('shrink-0 text-right tabular-nums', DEAD.has(e.state) ? 'text-text-tertiary' : 'text-body-medium text-text-primary')}>
                          {formatValue(e)}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleBar(e.id)}
                          aria-pressed={bar.includes(e.id)}
                          title={bar.includes(e.id) ? 'Retirer de la barre de statut' : 'Afficher dans la barre de statut'}
                          className={cx(
                            'grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                            bar.includes(e.id) ? 'text-accent-400' : 'text-foreground-icon-tertiary',
                          )}
                        >
                          <RiLayoutTop2Line className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePin(e.id)}
                          aria-pressed={on}
                          title={on ? 'Retirer de la tuile' : 'Afficher sur la tuile'}
                          className={cx(
                            'grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg outline-none hover:bg-background-tertiary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                            on ? 'text-accent-400' : 'text-foreground-icon-tertiary',
                          )}
                        >
                          {on ? <RiPushpinFill className="size-4" aria-hidden /> : <RiPushpinLine className="size-4" aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  RiAddLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiDeleteBinLine,
  RiEditLine,
  RiHome5Fill,
  RiHome5Line,
  RiListCheck2,
  RiSparkling2Line,
} from '@remixicon/react';
import { haApi, integrationsApi } from '../api';
import { useShell } from '../lib/shell';
import { useHaWidgets } from '../hooks/useHaWidgets';
import type { HaEntity, HaWidget } from '../types';
import { PageHeader, Panel } from '../components/ui/panel';
import { Button, ButtonLink } from '../components/ui/button';
import { HaWidgetGrid } from '../components/ha/HaWidgetGrid';
import { HaWidgetEditor } from '../components/ha/HaWidgetEditor';
import { DEAD } from '../lib/ha';
import { cx } from '../utils/cx';

/**
 * Maison: every Home Assistant widget (components/ha/). "Modifier" shows a
 * strip on each card to move it, show it on the home page too, edit or
 * delete it. Empty, the page offers a starter set built from the house.
 */

// Sensors of machines rather than rooms (NAS disks, the car, appliances).
const MACHINE = /nas|synology|drive|disk|disque|volume|cpu|skoda|tesla|renault|dyson|radiateur|imprimante|printer/;
const VEHICLE = /skoda|tesla|renault|peugeot|voiture|car_/;

/** A first set from what the house has: rooms, presences and doors, lights and scripts. */
function starterSet(all: HaEntity[]): Partial<HaWidget>[] {
  const live = all.filter(e => !DEAD.has(e.state));
  const out: Partial<HaWidget>[] = [];
  const climate = live.filter(e => e.domain === 'sensor' && e.area && !MACHINE.test(e.id) && ['temperature', 'humidity'].includes(e.deviceClass ?? ''));
  const temp = climate.find(e => e.deviceClass === 'temperature' && e.area === 'Salon') ?? climate.find(e => e.deviceClass === 'temperature');
  if (temp) out.push({ kind: 'value', title: temp.area ?? '', entities: [temp.id] });
  // Rooms with a real thermometer (temperature and humidity), the best equipped first.
  const rooms = new Map<string, HaEntity[]>();
  for (const e of climate) rooms.set(e.area!, [...(rooms.get(e.area!) ?? []), e]);
  [...rooms.entries()]
    .filter(([area, list]) => area !== temp?.area && list.some(e => e.deviceClass === 'humidity') && list.some(e => e.deviceClass === 'temperature'))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 2)
    .forEach(([area, list]) => out.push({ kind: 'room', title: area, entities: list.slice(0, 4).map(e => e.id) }));
  // Who is home, the house's doors, then the car's battery and a disk as gauges.
  const status = [
    ...live.filter(e => e.domain === 'person'),
    ...live.filter(e => e.domain === 'binary_sensor' && e.area && !VEHICLE.test(e.id) && ['door', 'opening', 'window', 'garage_door'].includes(e.deviceClass ?? '')).slice(0, 4),
    ...live.filter(e => e.domain === 'sensor' && e.deviceClass === 'battery' && VEHICLE.test(e.id)).slice(0, 1),
    ...live.filter(e => e.domain === 'sensor' && e.unit === '%' && /volume.*(utilise|used)/.test(e.id)).slice(0, 1),
  ].slice(0, 8);
  if (status.length) out.push({ kind: 'status', title: 'Maison', entities: status.map(e => e.id) });
  const controls = [...live.filter(e => e.domain === 'light'), ...live.filter(e => e.domain === 'script')].slice(0, 8);
  if (controls.length) out.push({ kind: 'control', title: 'Lumières et scripts', entities: controls.map(e => e.id), size: 'wide' });
  return out.map(w => ({ onHome: true, size: 'small', ...w }));
}

export const Maison: React.FC = () => {
  const { notify } = useShell();
  const { data, error, reload } = useHaWidgets();
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<{ widget?: HaWidget } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);

  const widgets = data?.widgets ?? [];

  const move = async (i: number, by: number) => {
    const ids = widgets.map(w => w.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await haApi.order(ids).catch(() => notify('Ordre non enregistré', 'err'));
    reload();
  };

  const toggleHome = async (w: HaWidget) => {
    await haApi.update(w.id, { onHome: !w.onHome }).catch(() => notify('Enregistrement impossible', 'err'));
    reload();
  };

  const remove = async (w: HaWidget) => {
    if (confirmDelete !== w.id) {
      setConfirmDelete(w.id);
      window.setTimeout(() => setConfirmDelete(id => (id === w.id ? null : id)), 4000);
      return;
    }
    setConfirmDelete(null);
    await haApi.remove(w.id).catch(() => notify('Suppression impossible', 'err'));
    reload();
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const { entities } = await integrationsApi.haEntities();
      const set = starterSet(entities);
      for (const w of set) await haApi.create(w);
      notify(`${set.length} widgets créés : modifie-les à ta guise`, 'ok');
      reload();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Création impossible', 'err');
    } finally {
      setSeeding(false);
    }
  };

  const tool = 'grid size-7 cursor-pointer place-items-center rounded-md text-foreground-icon-secondary hover:bg-background-tertiary-default hover:text-foreground-icon-primary disabled:cursor-default disabled:opacity-30';

  const toolbar = (w: HaWidget, i: number) =>
    editing ? (
      <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-border-button-default bg-background-secondary-default p-0.5 shadow-dropdown">
        <button type="button" className={tool} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Avancer">
          <RiArrowLeftSLine className="size-4" aria-hidden />
        </button>
        <button type="button" className={tool} disabled={i === widgets.length - 1} onClick={() => move(i, 1)} aria-label="Reculer">
          <RiArrowRightSLine className="size-4" aria-hidden />
        </button>
        <button type="button" className={cx(tool, w.onHome && 'text-accent-400')} onClick={() => toggleHome(w)} aria-pressed={w.onHome} title={w.onHome ? 'Retirer de l’accueil' : 'Afficher sur l’accueil'}>
          {w.onHome ? <RiHome5Fill className="size-4" aria-hidden /> : <RiHome5Line className="size-4" aria-hidden />}
        </button>
        <button type="button" className={tool} onClick={() => setEditor({ widget: w })} aria-label="Modifier">
          <RiEditLine className="size-4" aria-hidden />
        </button>
        <button type="button" className={cx(tool, confirmDelete === w.id && 'w-auto px-1.5 text-text-error-primary')} onClick={() => remove(w)} aria-label="Supprimer">
          {confirmDelete === w.id ? <span className="text-caption-1-medium">Supprimer ?</span> : <RiDeleteBinLine className="size-4" aria-hidden />}
        </button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Maison"
        subtitle={
          data
            ? `${widgets.length} widget${widgets.length > 1 ? 's' : ''} · ${widgets.filter(w => w.onHome).length} sur l’accueil · actualisé toutes les 30 s`
            : 'Home Assistant'
        }
        actions={
          <>
            <ButtonLink variant="secondary" size="small" href="#/systeme/home-assistant" leadingIcon={RiListCheck2}>
              Tous les capteurs
            </ButtonLink>
            {widgets.length > 0 && (
              <Button variant={editing ? 'primary' : 'secondary'} size="small" leadingIcon={RiEditLine} onClick={() => setEditing(e => !e)}>
                {editing ? 'Terminé' : 'Modifier'}
              </Button>
            )}
            <Button size="small" leadingIcon={RiAddLine} onClick={() => setEditor({})}>
              Nouveau widget
            </Button>
          </>
        }
      />

      {error && (
        <Panel>
          <p className="text-body-regular text-text-error-primary">{error}</p>
        </Panel>
      )}

      {!data && !error && <p className="text-body-regular text-text-tertiary">Chargement…</p>}

      {data && !widgets.length && (
        <Panel title="Aucun widget pour l’instant" subtitle="Crée-les un par un, ou pars d’une sélection faite d’après ta maison : une pièce avec sa courbe, les pièces les mieux équipées, présences et portes, lumières et scripts.">
          <div className="flex flex-wrap gap-2">
            <Button leadingIcon={RiSparkling2Line} onClick={seed} disabled={seeding}>
              {seeding ? 'Création…' : 'Widgets de départ'}
            </Button>
            <Button variant="secondary" leadingIcon={RiAddLine} onClick={() => setEditor({})}>
              Nouveau widget
            </Button>
          </div>
        </Panel>
      )}

      {data && widgets.length > 0 && <HaWidgetGrid widgets={widgets} data={data} onChanged={reload} toolbar={toolbar} />}

      {editor && <HaWidgetEditor widget={editor.widget} onClose={() => setEditor(null)} onSaved={reload} />}
    </div>
  );
};

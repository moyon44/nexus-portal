import React, { useEffect, useMemo, useState } from 'react';
import { RiCloseLine, RiSearchLine } from '@remixicon/react';
import { haApi, integrationsApi } from '../../api';
import type { HaEntity, HaWidget, HaWidgetKind } from '../../types';
import { SegmentedControl } from '../ui/segmented-control';
import { Input, Select, Switch } from '../ui/form';
import { Button } from '../ui/button';
import { CONTROL_DOMAINS, DEAD, formatValue, isNumber } from '../../lib/ha';
import { cx } from '../../utils/cx';

/**
 * Create or edit a Home Assistant widget: its type, the entities it shows
 * (a searchable list of what fits that type), a title, its size and whether
 * the home page shows it. "Pièce" can fill itself from a room.
 */

const KINDS: { key: HaWidgetKind; label: string; hint: string }[] = [
  { key: 'value', label: 'Valeur', hint: 'Une grande valeur et sa courbe sur 24 h.' },
  { key: 'room', label: 'Pièce', hint: 'Plusieurs capteurs d’une pièce, sur deux colonnes.' },
  { key: 'status', label: 'États', hint: 'Jauges pour les pourcentages, pastilles pour les portes, présences, volets…' },
  { key: 'control', label: 'Contrôles', hint: 'Boutons : lumières, prises, scripts, scènes, volets, serrures.' },
];

// What each type can hold.
const FITS: Record<HaWidgetKind, (e: HaEntity) => boolean> = {
  value: e => e.domain === 'sensor' && (isNumber(e.state) || !!e.unit),
  room: e => e.domain === 'sensor' || e.domain === 'binary_sensor',
  status: e => ['sensor', 'binary_sensor', 'person', 'device_tracker', 'lock', 'cover'].includes(e.domain),
  control: e => CONTROL_DOMAINS.includes(e.domain),
};

// A room's sensors worth showing, in this order.
const ROOM_CLASSES = ['temperature', 'humidity', 'carbon_dioxide', 'pm25', 'illuminance', 'pressure', 'power'];

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function HaWidgetEditor({ widget, onClose, onSaved }: { widget?: HaWidget; onClose: () => void; onSaved: () => void }) {
  const [all, setAll] = useState<HaEntity[] | null>(null);
  const [kind, setKind] = useState<HaWidgetKind>(widget?.kind ?? 'value');
  const [title, setTitle] = useState(widget?.title ?? '');
  const [picked, setPicked] = useState<string[]>(widget?.entities ?? []);
  const [size, setSize] = useState<'small' | 'wide'>(widget?.size ?? 'small');
  const [onHome, setOnHome] = useState(widget?.onHome ?? true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    integrationsApi
      .haEntities()
      .then(r => setAll(r.entities))
      .catch(e => setError(e instanceof Error ? e.message : 'Home Assistant indisponible'));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byId = useMemo(() => new Map((all ?? []).map(e => [e.id, e])), [all]);
  const areas = useMemo(() => [...new Set((all ?? []).map(e => e.area).filter(Boolean) as string[])].sort(), [all]);

  const candidates = useMemo(() => {
    const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
    return (all ?? [])
      .filter(e => FITS[kind](e) && !picked.includes(e.id))
      .filter(e => words.every(w => normalize(`${e.name} ${e.id} ${e.area ?? ''}`).includes(w)))
      .sort((a, b) => Number(DEAD.has(a.state)) - Number(DEAD.has(b.state)) || a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [all, kind, query, picked]);

  const single = kind === 'value';

  const add = (id: string) => setPicked(p => (single ? [id] : p.length >= 16 ? p : [...p, id]));
  const remove = (id: string) => setPicked(p => p.filter(x => x !== id));

  const fillRoom = (area: string) => {
    if (!area || !all) return;
    const inRoom = all.filter(e => e.area === area && e.domain === 'sensor' && !DEAD.has(e.state) && ROOM_CLASSES.includes(e.deviceClass ?? ''));
    inRoom.sort((a, b) => ROOM_CLASSES.indexOf(a.deviceClass!) - ROOM_CLASSES.indexOf(b.deviceClass!));
    setPicked(inRoom.slice(0, 8).map(e => e.id));
    if (!title) setTitle(area);
  };

  const changeKind = (k: HaWidgetKind) => {
    setKind(k);
    // Keep what still fits the new type.
    setPicked(p => p.filter(id => byId.get(id) && FITS[k](byId.get(id)!)).slice(0, k === 'value' ? 1 : 16));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { kind, title: title.trim(), entities: picked, size, onHome };
      if (widget) await haApi.update(widget.id, body);
      else await haApi.create(body);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto px-4 py-[8vh]">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={widget ? 'Modifier le widget' : 'Nouveau widget'}
        className="animate-dialog-in relative flex w-full max-w-2xl flex-col gap-4 rounded-3xl border border-border-button-default bg-background-secondary-default p-5 shadow-waitlist"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-headline-medium text-text-primary">{widget ? 'Modifier le widget' : 'Nouveau widget'}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-8 cursor-pointer place-items-center rounded-lg text-foreground-icon-tertiary hover:bg-background-tertiary-default">
            <RiCloseLine className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <SegmentedControl<HaWidgetKind> label="Type de widget" value={kind} onChange={changeKind} options={KINDS.map(k => ({ key: k.key, label: k.label }))} />
          <p className="text-body-2-regular text-text-tertiary">{KINDS.find(k => k.key === kind)!.hint}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Titre" value={title} placeholder={single && picked[0] ? byId.get(picked[0])?.name : 'Salon, Voiture, Portes…'} onChange={e => setTitle(e.target.value)} />
          {kind === 'room' ? (
            <Select label="Remplir depuis une pièce" value="" onChange={e => fillRoom(e.target.value)}>
              <option value="">Choisir une pièce…</option>
              {areas.map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          ) : (
            <span className="hidden sm:block" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-body-2-regular text-text-secondary">Taille</span>
          <SegmentedControl<'small' | 'wide'>
            label="Taille"
            value={size}
            onChange={setSize}
            options={[
              { key: 'small', label: 'Normal' },
              { key: 'wide', label: 'Large (2 colonnes)' },
            ]}
          />
        </div>

        {/* Chosen */}
        <div className="flex flex-col gap-2">
          <p className="text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">
            {single ? 'Capteur' : `Entités (${picked.length}/16)`}
          </p>
          {picked.length ? (
            <div className="flex flex-wrap gap-2">
              {picked.map(id => {
                const e = byId.get(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => remove(id)}
                    title="Retirer"
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border border-accent-400 px-3 py-1 text-body-2-regular text-text-primary"
                  >
                    <span className="max-w-[14rem] truncate">{e?.name ?? id}</span>
                    {e && <span className="text-text-tertiary tabular-nums">{formatValue(e)}</span>}
                    <RiCloseLine className="size-3.5 text-foreground-icon-tertiary" aria-hidden />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-body-2-regular text-text-tertiary">Rien de choisi : cherche ci-dessous{kind === 'room' ? ' ou remplis depuis une pièce' : ''}.</p>
          )}
        </div>

        {/* Candidates */}
        <div className="flex flex-col gap-2">
          <Input leadingIcon={RiSearchLine} placeholder="Chercher (salon, voiture, volet, lampe…)" value={query} onChange={e => setQuery(e.target.value)} aria-label="Chercher une entité" />
          <ul className="max-h-[34vh] overflow-y-auto rounded-2xl border border-separator-border">
            {!all && !error && <li className="px-3 py-4 text-body-2-regular text-text-tertiary">Chargement…</li>}
            {all && !candidates.length && <li className="px-3 py-4 text-body-2-regular text-text-tertiary">Aucune entité de ce type ne correspond.</li>}
            {candidates.map(e => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => add(e.id)}
                  className="flex w-full cursor-pointer items-center gap-3 border-b border-separator-border px-3 py-2 text-left last:border-0 hover:bg-background-tertiary-default"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-2-regular text-text-primary">{e.name}</span>
                    <span className="truncate font-mono text-caption-1-regular text-text-tertiary">
                      {e.area ? `${e.area} · ` : ''}
                      {e.id}
                    </span>
                  </span>
                  <span className={cx('shrink-0 text-body-2-regular tabular-nums', DEAD.has(e.state) ? 'text-text-tertiary' : 'text-text-secondary')}>{formatValue(e)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Switch checked={onHome} onChange={setOnHome} label="Afficher aussi sur l’accueil" />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="small" onClick={onClose}>
              Annuler
            </Button>
            <Button size="small" onClick={save} disabled={saving || !picked.length}>
              {widget ? 'Enregistrer' : 'Créer le widget'}
            </Button>
          </div>
        </div>
        {error && <p className="text-body-2-regular text-text-error-primary">{error}</p>}
      </div>
    </div>
  );
}

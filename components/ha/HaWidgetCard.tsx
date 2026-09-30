import React, { useState } from 'react';
import {
  RiArrowDownSLine,
  RiArrowUpSLine,
  RiLoader4Line,
  RiLockLine,
  RiLockUnlockLine,
  RiPlayLine,
  RiStopLine,
} from '@remixicon/react';
import { haApi } from '../../api';
import { useShell } from '../../lib/shell';
import type { HaLive, HaWidget, HaWidgetsData } from '../../types';
import { Tile, WidgetShell, Big, Dot, Rail } from '../ui/widget';
import { AreaChart } from '../ui/area-chart';
import { DEAD, ago, formatValue, isNumber, number, roomLabel, sensitive, shortName, toneOf, withUnit } from '../../lib/ha';
import { cx } from '../../utils/cx';
import { LightPanel, dimmable, lightColor } from './LightPanel';

/**
 * One Home Assistant widget (backend routes/ha.ts):
 *  - value    big value of its first entity and its last 24 h;
 *  - room     several sensors of one room, two columns;
 *  - status   gauges for percentages, a coloured dot for everything else;
 *  - control  buttons: toggle, run, open / stop / close, lock / unlock; a
 *             light's swatch opens its brightness / colour / white panel.
 * `toolbar` is the editing strip the Maison page adds on top.
 */

type Props = {
  widget: HaWidget;
  data: HaWidgetsData;
  onChanged: () => void;
  toolbar?: React.ReactNode;
};

const missing = (id: string): HaLive => ({
  id,
  domain: id.split('.')[0],
  name: id,
  state: 'unavailable',
  unit: null,
  deviceClass: null,
  changed: new Date().toISOString(),
  position: null,
  brightness: null,
});

export function HaWidgetCard({ widget, data, onChanged, toolbar }: Props) {
  const items = widget.entities.map(id => data.states[id] ?? missing(id));
  const first = items[0];
  const title = widget.title || first?.name || 'Widget';

  return (
    <Tile className={cx('relative', widget.size === 'wide' && 'sm:col-span-2')}>
      {toolbar}
      <WidgetShell title={title} meta={widget.kind === 'value' && first && !DEAD.has(first.state) ? ago(first.changed) : undefined}>
        {widget.kind === 'value' && first && <ValueBody e={first} points={data.history[first.id] ?? []} />}
        {widget.kind === 'room' && <RoomBody items={items} title={title} />}
        {widget.kind === 'status' && <StatusBody items={items} title={title} />}
        {widget.kind === 'control' && <ControlBody items={items} title={title} onChanged={onChanged} />}
      </WidgetShell>
    </Tile>
  );
}

function ValueBody({ e, points }: { e: HaLive; points: { t: number; v: number }[] }) {
  const numeric = isNumber(e.state);
  const values = points.map(p => p.v);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 0;
  // A little room above and below so a flat line doesn't hug an edge.
  const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.02, 0.5);
  const fmt = (v: number) => withUnit(number(v), e.unit);
  return (
    <div className="flex flex-1 flex-col justify-between gap-3">
      {numeric ? (
        <Big unit={e.unit ?? undefined}>{number(Number(e.state))}</Big>
      ) : (
        <Big className={cx(DEAD.has(e.state) && 'text-text-tertiary')}>{formatValue(e)}</Big>
      )}
      {values.length > 1 && (
        <div className="flex flex-col gap-1">
          <AreaChart points={points} label={e.name} height={72} domain={[lo - pad, hi + pad]} format={fmt} period="sur 24 h" />
          <p className="flex justify-between text-caption-1-regular text-text-tertiary tabular-nums">
            <span>24 h</span>
            <span>
              {fmt(lo)} – {fmt(hi)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function RoomBody({ items, title }: { items: HaLive[]; title: string }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map(e => (
        <div key={e.id} className="flex min-w-0 flex-col">
          <dt className="truncate text-caption-1-regular text-text-tertiary" title={e.name}>
            {roomLabel(e, title, items)}
          </dt>
          <dd className={cx('truncate text-headline-medium tabular-nums', DEAD.has(e.state) ? 'text-text-tertiary' : 'text-text-primary')}>
            {formatValue(e)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatusBody({ items, title }: { items: HaLive[]; title: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map(e => {
        const tone = toneOf(e);
        const gauge = e.unit === '%' && isNumber(e.state);
        return (
          <li key={e.id} className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-body-2-regular">
              {!gauge && <Dot tone={tone} />}
              <span className="min-w-0 truncate text-text-primary" title={e.name}>
                {shortName(e.name, title)}
              </span>
              <span className="ml-auto shrink-0 text-text-tertiary tabular-nums">
                {formatValue(e)}
                {!gauge && !DEAD.has(e.state) && e.domain !== 'sensor' && <span className="hidden @xs:inline"> · {ago(e.changed)}</span>}
              </span>
            </span>
            {gauge && <Rail pct={Number(e.state)} tone={tone} />}
          </li>
        );
      })}
    </ul>
  );
}

function ControlBody({ items, title, onChanged }: { items: HaLive[]; title: string; onChanged: () => void }) {
  const { notify } = useShell();
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = async (e: HaLive, action: string, label: string) => {
    const key = `${e.id}:${action}`;
    if (sensitive(e.id) && armed !== key) {
      setArmed(key);
      window.setTimeout(() => setArmed(k => (k === key ? null : k)), 4000);
      return;
    }
    setArmed(null);
    setBusy(key);
    try {
      await haApi.control(e.id, action);
      notify(`${shortName(e.name, title)} : ${label}`, 'ok');
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Commande impossible', 'err');
    } finally {
      setBusy(null);
    }
  };

  const btn = (e: HaLive, action: string, label: string, content: React.ReactNode, active = false) => {
    const key = `${e.id}:${action}`;
    return (
      <button
        type="button"
        disabled={busy !== null || DEAD.has(e.state)}
        onClick={() => run(e, action, label)}
        title={label}
        className={cx(
          'flex h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 text-caption-1-medium outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed disabled:opacity-50',
          armed === key
            ? 'bg-status-rose-background text-status-rose-text'
            : active
              ? 'bg-accent-400 text-text-white'
              : 'bg-background-tertiary-default text-text-primary hover:bg-background-tertiary-hover',
        )}
      >
        {busy === key ? <RiLoader4Line className="size-4 animate-spin" aria-hidden /> : armed === key ? 'Confirmer ?' : content}
      </button>
    );
  };

  return (
    <ul className="flex flex-col gap-2">
      {items.map(e => {
        const name = shortName(e.name, title);
        const on = e.state === 'on';
        let actions: React.ReactNode = null;
        if (e.domain === 'light' && dimmable(e)) {
          const color = lightColor(e);
          actions = (
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOpen(o => (o === e.id ? null : e.id))}
                disabled={DEAD.has(e.state)}
                aria-expanded={open === e.id}
                title="Luminosité et couleur"
                aria-label={`Luminosité et couleur de ${name}`}
                className={cx(
                  'size-7 shrink-0 cursor-pointer rounded-full border-2 outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed disabled:opacity-40',
                  open === e.id ? 'border-text-primary' : 'border-border-button-default',
                )}
                style={{ background: color ?? 'repeating-linear-gradient(45deg, transparent 0 3px, var(--color-separator-border) 3px 5px)', boxShadow: color ? `0 0 12px ${color}` : undefined }}
              />
              {btn(e, 'toggle', on ? 'éteint' : 'allumé', on ? 'Allumé' : 'Éteint', on)}
            </span>
          );
        } else if (['light', 'switch', 'fan', 'input_boolean'].includes(e.domain)) {
          actions = btn(e, 'toggle', on ? 'éteint' : 'allumé', on ? 'Allumé' : 'Éteint', on);
        } else if (['script', 'scene', 'button', 'input_button'].includes(e.domain)) {
          actions = btn(e, 'run', 'lancé', <RiPlayLine className="size-4" aria-hidden />);
        } else if (e.domain === 'cover') {
          actions = (
            <span className="flex gap-1">
              {btn(e, 'open', 'ouverture', <RiArrowUpSLine className="size-4" aria-hidden />)}
              {btn(e, 'stop', 'arrêt', <RiStopLine className="size-4" aria-hidden />)}
              {btn(e, 'close', 'fermeture', <RiArrowDownSLine className="size-4" aria-hidden />)}
            </span>
          );
        } else if (e.domain === 'lock') {
          actions =
            e.state === 'locked'
              ? btn(e, 'unlock', 'déverrouillé', <RiLockUnlockLine className="size-4" aria-hidden />)
              : btn(e, 'lock', 'verrouillé', <RiLockLine className="size-4" aria-hidden />);
        } else if (e.domain === 'vacuum') {
          actions = (
            <span className="flex gap-1">
              {btn(e, 'start', 'démarré', <RiPlayLine className="size-4" aria-hidden />)}
              {btn(e, 'dock', 'retour à la base', 'Base')}
            </span>
          );
        }
        const detail =
          e.domain === 'cover' && e.position !== null
            ? `${e.position} % ouvert`
            : e.domain === 'light' && on && e.brightness !== null
              ? `${Math.round((e.brightness / 255) * 100)} %`
              : ['script', 'scene', 'button', 'input_button'].includes(e.domain)
                ? null
                : formatValue(e);
        return (
          <li key={e.id} className="flex flex-col gap-2">
            <span className="flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-2-regular text-text-primary" title={e.name}>
                  {name}
                </span>
                {detail && <span className="truncate text-caption-1-regular text-text-tertiary">{detail}</span>}
              </span>
              {actions}
            </span>
            {open === e.id && !DEAD.has(e.state) && <LightPanel e={e} onChanged={onChanged} />}
          </li>
        );
      })}
    </ul>
  );
}

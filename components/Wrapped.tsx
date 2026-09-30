import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine, RiFireLine, RiImageLine, RiPauseLine, RiPlayLine, RiRestartLine } from '@remixicon/react';
import { toPng } from 'html-to-image';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import { wrappedApi } from '../api';
import { reducedMotion } from '../lib/motion';
import { useBrandColor, useLogoSrc } from '../lib/brandColor';
import type { Service, WrappedData } from '../types';
import { LinkIcon } from './LinkIcon';
import { cx } from '../utils/cx';

/**
 * Nexus Wrapped: the month told as a story (Spotify Wrapped style). Full
 * screen, one slide at a time with progress bars on top; tap or → for the
 * next slide, ← for the previous one, hold (or Space) to pause, Esc to
 * close. The last slide is a summary card that can be saved as a PNG.
 *
 * Data: GET /api/wrapped (backend routes/wrapped.ts). The look follows the
 * active style (styles/wrapped.css, html[data-skin] overrides).
 */

const EVENT = 'portail:wrapped';
const DURATION = 6500;

export function openWrapped(month?: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { month } }));
}

/* ---- Helpers --------------------------------------------------------------- */

const fmt = (n: number) => n.toLocaleString('fr-FR');
const pct = (v: number) => `${Math.round(v * 100)} %`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const duration = (secs: number) => {
  if (secs < 90) return `${secs} s`;
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
};

function useCountUp(target: number, ms = 1500) {
  const [v, setV] = useState(() => (reducedMotion() ? target : 0));
  useEffect(() => {
    if (reducedMotion()) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

interface Persona {
  emoji: string;
  title: string;
  text: string;
}

function personaOf(d: WrappedData, byId: Map<string, Service>): Persona {
  const o = d.opens;
  const t = o.total || 1;
  const top = d.top[0];
  const peak = o.hours.indexOf(Math.max(...o.hours));
  if (o.night / t >= 0.25) return { emoji: '🦉', title: 'Le Noctambule', text: `${pct(o.night / t)} de tes clics entre minuit et 5 h.` };
  if (o.early / t >= 0.2) return { emoji: '🌅', title: 'Le Lève-tôt', text: `${pct(o.early / t)} de tes clics avant 8 h.` };
  if (top && top.count / t >= 0.45)
    return { emoji: '💘', title: 'Le Fidèle', text: `${byId.get(top.serviceId)?.name ?? 'Ton n°1'} a eu ${pct(top.count / t)} de ton attention.` };
  if (o.activeDays / Math.max(1, o.daysInPeriod) >= 0.8) return { emoji: '⏱️', title: 'Le Métronome', text: `Présent ${o.activeDays} jours sur ${o.daysInPeriod}.` };
  if (o.distinctServices / Math.max(1, o.totalServices) >= 0.5)
    return { emoji: '🧭', title: 'L’Explorateur', text: `${o.distinctServices} services différents ouverts sur ${o.totalServices}.` };
  if (peak >= 19) return { emoji: '🌙', title: 'Le Veilleur du soir', text: `C’est vers ${peak} h que tout se passe.` };
  return { emoji: '✨', title: 'Le Curieux', text: `${fmt(o.total)} ouvertures, et ce n’est qu’un début.` };
}

/* ---- Slides ----------------------------------------------------------------- */

type SlideProps = { d: WrappedData; byId: Map<string, Service>; persona: Persona };

const Line = ({ d = 0, className, children }: { d?: number; className?: string; children: React.ReactNode }) => (
  <div className={cx('wr-in', className)} style={{ '--d': `${d}ms` } as React.CSSProperties}>
    {children}
  </div>
);

function Intro({ d, byId }: SlideProps) {
  const month = cap(d.label.split(' ')[0]);
  const year = d.label.split(' ')[1];
  const orbit = d.top.slice(0, 5).map(t => byId.get(t.serviceId)).filter(Boolean) as Service[];
  return (
    <>
      <div aria-hidden className="wr-orbit">
        {orbit.map((s, i) => (
          <span key={s.id} style={{ '--i': i, '--n': orbit.length } as React.CSSProperties}>
            <LinkIcon service={s} size={30} />
          </span>
        ))}
      </div>
      <Line className="wr-kicker">Nexus Wrapped</Line>
      <Line d={150} className="wr-mega">
        <span style={{ '--len': month.length } as React.CSSProperties} className="wr-fit block">
          {month}
        </span>
      </Line>
      <Line d={300} className="wr-year">
        {year}
      </Line>
      <Line d={600} className="wr-sub mt-auto">
        {d.userName ? `Prêt, ${d.userName} ?` : 'Prêt ?'} Voici ton mois sur le portail.
      </Line>
    </>
  );
}

function Opens({ d }: SlideProps) {
  const n = useCountUp(d.opens.total);
  return (
    <>
      <Line className="wr-kicker">Ce mois-ci, tu as ouvert</Line>
      <Line d={150} className="wr-mega tabular-nums">
        {fmt(n)}
      </Line>
      <Line d={300} className="wr-title">
        {d.opens.total > 1 ? 'liens' : 'lien'}
      </Line>
      <div className="mt-auto flex flex-wrap gap-2">
        <Line d={900} className="wr-chip">
          {d.opens.activeDays} jour{d.opens.activeDays > 1 ? 's' : ''} actif{d.opens.activeDays > 1 ? 's' : ''}
        </Line>
        <Line d={1050} className="wr-chip">
          {d.opens.distinctServices} services sur {d.opens.totalServices}
        </Line>
      </div>
    </>
  );
}

function TopOne({ d, byId }: SlideProps) {
  const top = d.top[0];
  const s = byId.get(top.serviceId)!;
  const brand = useBrandColor(useLogoSrc(s));
  return (
    <>
      {/* The slide takes the service's brand colour. */}
      <div aria-hidden className="wr-brand-bg" style={brand ? ({ '--brand': brand } as React.CSSProperties) : undefined} />
      <Line className="wr-kicker">Ton service n°1</Line>
      <Line d={200} className="wr-hero-logo">
        <LinkIcon service={s} size={120} />
      </Line>
      <Line d={450} className="wr-big">
        {s.name}
      </Line>
      <Line d={650} className="wr-sub">
        {fmt(top.count)} ouverture{top.count > 1 ? 's' : ''} · {pct(top.count / Math.max(1, d.opens.total))} de tes clics
      </Line>
    </>
  );
}

function TopFive({ d, byId }: SlideProps) {
  const max = d.top[0]?.count ?? 1;
  return (
    <>
      <Line className="wr-kicker">Ton top {d.top.length}</Line>
      <ol className="mt-4 flex flex-col gap-3">
        {d.top.map((t, i) => {
          const s = byId.get(t.serviceId);
          if (!s) return null;
          return (
            <li key={t.serviceId} className="wr-in wr-rank" style={{ '--d': `${200 + i * 140}ms` } as React.CSSProperties}>
              <span className="wr-rank-n">{i + 1}</span>
              <span className="wr-rank-logo">
                <LinkIcon service={s} size={26} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate font-semibold">{s.name}</span>
                <span className="wr-bar" style={{ '--w': `${Math.max(6, (t.count / max) * 100)}%`, '--d': `${400 + i * 140}ms` } as React.CSSProperties} />
              </span>
              <span className="wr-rank-count tabular-nums">{fmt(t.count)}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Hours({ d }: SlideProps) {
  const h = d.opens.hours;
  const max = Math.max(1, ...h);
  const peak = h.indexOf(max);
  const parts = [
    { label: 'la nuit', n: h.slice(0, 6).reduce((a, b) => a + b, 0) },
    { label: 'le matin', n: h.slice(6, 12).reduce((a, b) => a + b, 0) },
    { label: 'l’après-midi', n: h.slice(12, 18).reduce((a, b) => a + b, 0) },
    { label: 'le soir', n: h.slice(18).reduce((a, b) => a + b, 0) },
  ].sort((a, b) => b.n - a.n);
  const R = 118;
  return (
    <>
      <Line className="wr-kicker">Ton heure de pointe</Line>
      <Line d={150} className="wr-mega">
        {peak} h
      </Line>
      <Line d={400} className="wr-clock">
        <svg viewBox="-150 -150 300 300" aria-hidden>
          <circle r={R - 30} className="wr-clock-face" />
          {h.map((n, i) => {
            const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
            const len = 8 + (n / max) * 44;
            return (
              <line
                key={i}
                x1={Math.cos(a) * (R - 22)}
                y1={Math.sin(a) * (R - 22)}
                x2={Math.cos(a) * (R - 22 + len)}
                y2={Math.sin(a) * (R - 22 + len)}
                className={cx('wr-clock-bar', i === peak && 'is-peak')}
                style={{ '--d': `${500 + i * 30}ms` } as React.CSSProperties}
              />
            );
          })}
          {[0, 6, 12, 18].map(i => {
            const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
            return (
              <text key={i} x={Math.cos(a) * (R - 48)} y={Math.sin(a) * (R - 48) + 5} textAnchor="middle" className="wr-clock-label">
                {i} h
              </text>
            );
          })}
        </svg>
      </Line>
      <Line d={1100} className="wr-sub mt-auto">
        Tu es surtout là {parts[0].label}.
      </Line>
    </>
  );
}

function Rhythm({ d }: SlideProps) {
  const st = d.opens.longestStreak;
  const n = useCountUp(st?.days ?? 0, 900);
  const w = d.opens.weekdays;
  const max = Math.max(1, ...w);
  return (
    <>
      <Line className="wr-kicker">Ta plus longue série</Line>
      <Line d={150} className="flex items-end gap-3">
        <RiFireLine className="wr-flame" aria-hidden />
        <span className="wr-mega tabular-nums">{n}</span>
      </Line>
      <Line d={300} className="wr-title">
        jour{(st?.days ?? 0) > 1 ? 's' : ''} d’affilée
      </Line>
      {d.opens.busiestDay && (
        <Line d={600} className="wr-sub mt-6">
          Record : {fmt(d.opens.busiestDay.count)} ouvertures le {dayLabel(d.opens.busiestDay.date)}.
        </Line>
      )}
      <div className="mt-auto flex h-32 items-stretch gap-2">
        {w.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="flex w-full flex-1 items-end">
              <span className={cx('wr-week', v === max && 'is-max')} style={{ '--h': `${Math.max(4, (v / max) * 100)}%`, '--d': `${800 + i * 70}ms` } as React.CSSProperties} />
            </span>
            <span className="text-[12px] font-semibold opacity-80">{'LMMJVSD'[i]}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Health({ d, byId }: SlideProps) {
  const h = d.health;
  const best = h.mostReliable && byId.get(h.mostReliable.serviceId);
  const worst = h.longestOutage && byId.get(h.longestOutage.serviceId);
  return (
    <>
      <Line className="wr-kicker">Tes serveurs ont tenu</Line>
      <Line d={150} className="wr-mega tabular-nums">
        {h.uptime !== null ? h.uptime.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '–'}
        <span className="wr-unit">%</span>
      </Line>
      <Line d={300} className="wr-sub">
        de disponibilité sur {fmt(h.checks)} vérifications
      </Line>
      <div className="mt-auto flex flex-col gap-2.5">
        {best && (
          <Line d={700} className="wr-card">
            <LinkIcon service={best} size={28} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold uppercase opacity-70">Le roc</span>
              <span className="block truncate font-bold">{best.name}</span>
            </span>
            <span className="font-bold tabular-nums">{h.mostReliable!.uptime.toLocaleString('fr-FR')} %</span>
          </Line>
        )}
        <Line d={900} className="wr-card">
          {worst ? (
            <>
              <LinkIcon service={worst} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold uppercase opacity-70">Pire panne</span>
                <span className="block truncate font-bold">{worst.name}</span>
              </span>
              <span className="text-right text-[13px] font-semibold">
                {duration(h.longestOutage!.seconds)}
                <br />
                <span className="opacity-70">{new Date(`${h.longestOutage!.day}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
              </span>
            </>
          ) : (
            <span className="font-semibold">🎉 Aucune panne sérieuse ce mois-ci</span>
          )}
        </Line>
        {h.perfectDays > 0 && (
          <Line d={1100} className="wr-sub text-[15px]">
            {h.perfectDays} jour{h.perfectDays > 1 ? 's' : ''} sans le moindre raté sur {h.daysMeasured} mesurés.
          </Line>
        )}
      </div>
    </>
  );
}

function Newcomers({ d, byId }: SlideProps) {
  const ids = [...new Set([...d.added, ...d.discoveries.map(x => x.serviceId)])];
  const list = ids.map(id => byId.get(id)).filter(Boolean).slice(0, 9) as Service[];
  return (
    <>
      <Line className="wr-kicker">Les nouveaux venus</Line>
      <Line d={150} className="wr-big">
        {d.added.length ? `${d.added.length} lien${d.added.length > 1 ? 's' : ''} ajouté${d.added.length > 1 ? 's' : ''}` : `${d.discoveries.length} découverte${d.discoveries.length > 1 ? 's' : ''}`}
      </Line>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {list.map((s, i) => (
          <div key={s.id} className="wr-in wr-tile" style={{ '--d': `${300 + i * 90}ms` } as React.CSSProperties}>
            <LinkIcon service={s} size={34} />
            <span className="w-full truncate text-center text-[12px] font-semibold">{s.name}</span>
          </div>
        ))}
      </div>
      {d.discoveries.length > 0 && d.added.length > 0 && (
        <Line d={1200} className="wr-sub mt-auto">
          et {d.discoveries.length} ouvert{d.discoveries.length > 1 ? 's' : ''} pour la première fois.
        </Line>
      )}
    </>
  );
}

function Summary({ d, byId, persona, cardRef, onMonth, onReplay }: SlideProps & { cardRef: React.RefObject<HTMLDivElement | null>; onMonth: (m: string) => void; onReplay: () => void }) {
  const { notify } = useShell();
  const [busy, setBusy] = useState(false);
  const peak = d.opens.hours.indexOf(Math.max(...d.opens.hours));
  const top3 = d.top.slice(0, 3).map(t => byId.get(t.serviceId)).filter(Boolean) as Service[];
  const save = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const url = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus-wrapped-${d.month}.png`;
      a.click();
    } catch {
      notify('Export de l’image impossible', 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div ref={cardRef} className="wr-in wr-summary">
        <div className="flex items-center justify-between text-[12px] font-bold tracking-[0.14em] uppercase opacity-80">
          <span>Nexus Wrapped</span>
          <span>{d.label}</span>
        </div>
        <div className="mt-4 text-[54px] leading-none">{persona.emoji}</div>
        <div className="wr-summary-title">{persona.title}</div>
        <p className="text-[14px] opacity-85">{persona.text}</p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="wr-stat">
            <b>{fmt(d.opens.total)}</b>ouvertures
          </div>
          <div className="wr-stat">
            <b>{d.opens.activeDays}</b>jours actifs
          </div>
          <div className="wr-stat">
            <b>{peak} h</b>heure de pointe
          </div>
          <div className="wr-stat">
            <b>{d.health.uptime !== null ? `${d.health.uptime.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %` : '–'}</b>disponibilité
          </div>
        </div>
        {top3.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[12px] font-bold uppercase opacity-70">Top</span>
            {top3.map((s, i) => (
              <span key={s.id} className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/15 py-1 pr-2.5 pl-1">
                <LinkIcon service={s} size={18} />
                <span className="truncate text-[12px] font-semibold">
                  {i + 1}. {s.name}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="wr-actions mt-auto" onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
        <button type="button" onClick={save} disabled={busy} className="wr-btn is-primary">
          <RiImageLine className="size-4" aria-hidden /> {busy ? 'Export…' : 'Enregistrer l’image'}
        </button>
        <button type="button" onClick={onReplay} className="wr-btn">
          <RiRestartLine className="size-4" aria-hidden /> Revoir
        </button>
        {d.months.length > 1 && (
          <select value={d.month} onChange={e => onMonth(e.target.value)} className="wr-btn" aria-label="Autre mois">
            {d.months.map(m => (
              <option key={m.key} value={m.key}>
                {cap(m.label)}
              </option>
            ))}
          </select>
        )}
      </div>
    </>
  );
}

/* ---- Story ------------------------------------------------------------------ */

export const Wrapped: React.FC = () => {
  const { data } = useDashboard();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<string | undefined>();
  const [d, setD] = useState<WrappedData | null>(null);
  const [error, setError] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0); // restarts the story
  const cardRef = useRef<HTMLDivElement>(null);
  const held = useRef(0);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setMonth((e as CustomEvent<{ month?: string }>).detail?.month);
      setIndex(0);
      setPaused(false);
      setOpen(true);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setD(null);
    setError(false);
    wrappedApi.get(month).then(setD).catch(() => setError(true));
  }, [open, month, run]);

  const byId = useMemo(() => new Map(data.services.map(s => [s.id, s])), [data.services]);
  const persona = useMemo(() => (d ? personaOf(d, byId) : null), [d, byId]);

  const slides = useMemo(() => {
    if (!d || !persona) return [];
    const list: { key: string; hue: number; node: React.ReactNode }[] = [];
    const p: SlideProps = { d, byId, persona };
    const push = (key: string, hue: number, node: React.ReactNode) => list.push({ key, hue, node });
    push('intro', 275, <Intro {...p} />);
    if (d.opens.total > 0) {
      push('opens', 330, <Opens {...p} />);
      if (d.top[0] && byId.has(d.top[0].serviceId)) push('top1', 20, <TopOne {...p} />);
      if (d.top.length > 1) push('top5', 150, <TopFive {...p} />);
      push('hours', 230, <Hours {...p} />);
      if (d.opens.longestStreak) push('rhythm', 45, <Rhythm {...p} />);
    }
    if (d.health.checks > 0) push('health', 165, <Health {...p} />);
    if (d.added.length || d.discoveries.length) push('new', 300, <Newcomers {...p} />);
    push(
      'summary',
      260,
      <Summary
        {...p}
        cardRef={cardRef}
        onMonth={m => {
          setMonth(m);
          setIndex(0);
        }}
        onReplay={() => setIndex(0)}
      />,
    );
    return list;
  }, [d, byId, persona]);

  const last = slides.length - 1;
  const go = useCallback((delta: number) => setIndex(i => Math.max(0, Math.min(last, i + delta))), [last]);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') setPaused(p => !p);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, go, close]);

  if (!open) return null;

  const slide = slides[index];
  return (
    <div className="wr-overlay" role="dialog" aria-modal="true" aria-label="Nexus Wrapped">
      <div className="absolute inset-0" onClick={close} />
      <button type="button" className="wr-side is-left" aria-label="Précédent" onClick={() => go(-1)} disabled={index === 0}>
        <RiArrowLeftSLine className="size-7" aria-hidden />
      </button>
      <div
        className="wr-story"
        style={{ '--h': slide?.hue ?? 275 } as React.CSSProperties}
        data-slide={slide?.key}
        onPointerDown={() => {
          held.current = Date.now();
          setPaused(true);
        }}
        onPointerUp={e => {
          const long = Date.now() - held.current > 280;
          setPaused(false);
          if (long || index === last) return;
          const r = e.currentTarget.getBoundingClientRect();
          go(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
        }}
        onPointerLeave={() => setPaused(false)}
      >
        <div aria-hidden className="wr-shapes">
          <span />
          <span />
          <span />
        </div>
        <div className="wr-progress">
          {slides.map((s, i) => (
            <span key={s.key} className={cx(i < index && 'is-done')}>
              {i === index && i < last && (
                <i
                  key={`${run}-${index}`}
                  style={{ animationDuration: `${DURATION}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                  onAnimationEnd={() => go(1)}
                />
              )}
              {i === index && i === last && <i className="is-full" />}
            </span>
          ))}
        </div>
        <div className="wr-top-actions" onPointerDown={e => e.stopPropagation()} onPointerUp={e => e.stopPropagation()}>
          <button type="button" onClick={() => setPaused(p => !p)} aria-label={paused ? 'Reprendre' : 'Pause'}>
            {paused ? <RiPlayLine className="size-5" aria-hidden /> : <RiPauseLine className="size-5" aria-hidden />}
          </button>
          <button type="button" onClick={close} aria-label="Fermer">
            <RiCloseLine className="size-6" aria-hidden />
          </button>
        </div>

        {error ? (
          <div className="wr-slide">
            <div className="wr-big mt-auto mb-auto">Impossible de charger ton Wrapped.</div>
          </div>
        ) : !d ? (
          <div className="wr-slide items-center justify-center">
            <span className="wr-loader" aria-label="Chargement" />
          </div>
        ) : (
          <div key={`${d.month}-${slide.key}`} className="wr-slide">
            {slide.node}
          </div>
        )}
      </div>
      <button type="button" className="wr-side is-right" aria-label="Suivant" onClick={() => go(1)} disabled={index >= last}>
        <RiArrowRightSLine className="size-7" aria-hidden />
      </button>
    </div>
  );
};

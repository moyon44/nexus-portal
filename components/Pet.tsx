import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { RiCloseLine, RiHeart3Fill } from '@remixicon/react';
import { useDashboard } from '../store';
import { useShell, dayPart } from '../lib/shell';
import { maintenanceApi, petApi } from '../api';
import { useSystemStats } from '../hooks/useSystemStats';
import { reducedMotion } from '../lib/motion';
import { moodLine, moodOf, needsOf, STAGE_EMOJI, type Needs, type PetMood, type PetStage, type PetState } from '../lib/pet';
import { updateQueue } from '../lib/updates';
import { cx } from '../utils/cx';

/**
 * The portal's creature, "Nexy" by default: it lives in the sidebar mark
 * (the old LogoEyes) and grows with the server's good health.
 *
 *  - Stage (œuf → bébé → ado → adulte → légende) from its XP, kept by the
 *    backend (services/pet.ts): +10 XP per hour with everything online,
 *    +5 per caress (6 a day).
 *  - Mood from live data (lib/pet.ts): sick when a service is down, hungry
 *    when image updates wait, dirty when Docker has junk to prune, tired
 *    when the disk is full, asleep at night, otherwise happy.
 *  - It eats when an update finishes, takes a bath after a cleanup
 *    (window event "portail:pet" {action: 'bath'}), and says so when it
 *    evolves.
 *
 * Click the mark for its card: gauges, what it needs, caress / feed / wash.
 */

const PET_EVENT = 'portail:pet';

/** Lets other parts of the app make it react (e.g. Maintenance after a prune). */
export function petReact(action: 'bath' | 'eat') {
  window.dispatchEvent(new CustomEvent(PET_EVENT, { detail: { action } }));
}

/* ---- Eyes follow the pointer, blink now and then ---------------------------- */

function useEyes(ref: React.RefObject<Element | null>, asleep: boolean) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (reducedMotion()) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, d / 160);
        setLook({ x: (dx / d) * 1.6 * reach, y: (dy / d) * 1.4 * reach });
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
  useEffect(() => {
    if (reducedMotion() || asleep) return;
    let t: number;
    const schedule = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 130);
        schedule();
      }, 2500 + Math.random() * 4500);
    };
    schedule();
    return () => window.clearTimeout(t);
  }, [asleep]);
  return { look, blink };
}

/* ---- The face -------------------------------------------------------------- */

const heart = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy + s * 0.9} C ${cx - s * 1.6} ${cy - s * 0.1}, ${cx - s * 0.8} ${cy - s * 1.4}, ${cx} ${cy - s * 0.5} C ${cx + s * 0.8} ${cy - s * 1.4}, ${cx + s * 1.6} ${cy - s * 0.1}, ${cx} ${cy + s * 0.9} Z`;

export function PetFace({ stage, mood, size, look, blink }: { stage: PetStage; mood: PetMood; size: number; look: { x: number; y: number }; blink: boolean }) {
  const uid = useId().replace(/:/g, '');
  const egg = stage === 'egg';
  const legend = stage === 'legend';
  const asleep = mood === 'sleeping';
  const closed = asleep || blink;
  const half = mood === 'tired';
  const eyeY = egg ? 16.5 : 14.5;
  const eyes = egg ? [10.5, 17.5] : [9.5, 18.5];
  const r = egg ? 2.6 : 3.3;
  const colors = legend
    ? ['#fde68a', '#f59e0b']
    : mood === 'sick'
      ? ['#fb7185', '#e11d48']
      : mood === 'tired'
        ? ['color-mix(in oklch, var(--color-accent-400) 55%, #9ca3af)', 'color-mix(in oklch, var(--color-accent-600) 55%, #6b7280)']
        : ['var(--color-accent-400)', 'var(--color-accent-600)'];

  return (
    <svg viewBox="0 0 28 28" width={size} height={size} className={cx('pet-face overflow-visible', `is-${mood}`, `stage-${stage}`)} aria-hidden>
      <defs>
        <linearGradient id={`b${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: colors[0] }} />
          <stop offset="1" style={{ stopColor: colors[1] }} />
        </linearGradient>
      </defs>

      {/* Halo (légende), antenna (ado, adulte) */}
      {legend && <ellipse cx="14" cy="-3.2" rx="7" ry="2" fill="none" stroke="#fbbf24" strokeWidth="1.4" className="pet-halo" />}
      {(stage === 'teen' || stage === 'adult') && (
        <g className="pet-antenna">
          <path d="M14 1.5 Q 15.5 -1.5 14 -4" stroke={colors[1]} strokeWidth="1.3" fill="none" strokeLinecap="round" />
          {stage === 'adult' ? (
            <path d="M14 -8.2 l1.1 2.2 2.4.3-1.8 1.6.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.6 2.4-.3z" fill="#fde047" />
          ) : (
            <circle cx="14" cy="-5.3" r="1.9" fill="var(--color-accent-300)" className="pet-bulb" />
          )}
        </g>
      )}

      {/* Body */}
      {egg ? (
        <g className="pet-egg">
          <path d="M14 1.5 C 21 1.5 25 11.5 25 18 C 25 24 20.5 27.2 14 27.2 C 7.5 27.2 3 24 3 18 C 3 11.5 7 1.5 14 1.5 Z" fill="#f6efdf" stroke="#d8c9a6" strokeWidth="0.8" />
          <circle cx="9" cy="8.5" r="1.3" fill="#e7d9b8" />
          <circle cx="19" cy="11" r="1.7" fill="#e7d9b8" />
          <circle cx="8" cy="23" r="1.1" fill="#e7d9b8" />
          <path d="M4.2 13.2 l2.6 -1.8 2.4 2 2.5 -2.2 2.4 2.1 2.5 -2.1 2.4 2 2.5 -1.9 2.2 1.6" fill="none" stroke="#b9a57a" strokeWidth="0.9" strokeLinejoin="round" />
        </g>
      ) : (
        <rect x="1" y="1" width="26" height="26" rx={stage === 'baby' ? 11 : 9} fill={`url(#b${uid})`} className="pet-body" />
      )}
      {legend && (
        <g fill="#fff7cc" className="pet-sparkles">
          <path d="M-3 6 l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z" />
          <path d="M30 17 l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />
        </g>
      )}

      {/* Brows when sick */}
      {mood === 'sick' && (
        <g stroke="white" strokeWidth="1.5" strokeLinecap="round">
          <line x1="6.8" y1="8.6" x2="11.4" y2="10.1" />
          <line x1="21.2" y1="8.6" x2="16.6" y2="10.1" />
        </g>
      )}

      {/* Eyes */}
      {eyes.map(x => (
        <g key={x}>
          {mood === 'loved' ? (
            <path d={heart(x, eyeY, 2.2)} fill="#ff5c8a" />
          ) : closed ? (
            <path d={asleep ? `M${x - 3} ${eyeY} q3 2.2 6 0` : `M${x - 3} ${eyeY} h6`} stroke={egg ? '#5b4a2c' : 'white'} strokeWidth="1.5" strokeLinecap="round" fill="none" />
          ) : (
            <>
              <ellipse cx={x} cy={eyeY} rx={r} ry={half ? r * 0.55 : egg ? r : r * 1.15} fill="white" stroke={egg ? '#5b4a2c' : 'none'} strokeWidth="0.6" />
              <circle cx={x + look.x * (egg ? 0.7 : 1)} cy={eyeY + look.y * (half ? 0.3 : 1) + (half ? 0.8 : 0)} r={egg ? 1.3 : 1.7} fill="#111" />
              {half && <path d={`M${x - 3.6} ${eyeY - 1.2} h7.2`} stroke={colors[1]} strokeWidth="2.2" />}
            </>
          )}
        </g>
      ))}

      {/* Cheeks */}
      {!egg && (stage === 'adult' || legend || mood === 'happy' || mood === 'loved' || mood === 'eating') && (
        <g fill="#ff8fb1" opacity="0.75">
          <circle cx="5.8" cy="19" r="1.7" />
          <circle cx="22.2" cy="19" r="1.7" />
        </g>
      )}

      {/* Mouth */}
      {!egg &&
        (mood === 'eating' ? (
          <ellipse cx="14" cy="20.3" rx="2.6" ry="1.8" fill="#3b0d1a" className="pet-chomp" />
        ) : mood === 'hungry' ? (
          <>
            <circle cx="14" cy="20.3" r="1.4" fill="#3b0d1a" />
            <path d="M16.2 21.5 q.9 1.6 0 2.4 q-.9-.8 0-2.4z" fill="#9bd7ff" className="pet-drool" />
          </>
        ) : mood === 'sick' ? (
          <path d="M10.2 20.6 q1.3 -1.2 2.6 0 t2.6 0 t2.6 0" stroke="white" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        ) : mood === 'tired' ? (
          <path d="M11.5 20.5 h5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
        ) : mood === 'sleeping' ? (
          <circle cx="14" cy="20.4" r="0.9" fill="white" opacity="0.8" />
        ) : (
          <path d={mood === 'loved' || mood === 'bath' ? 'M10.6 19.2 q3.4 3.6 6.8 0 z' : 'M11 19.5 q3 2.6 6 0'} stroke="white" strokeWidth="1.4" strokeLinecap="round" fill={mood === 'loved' || mood === 'bath' ? '#3b0d1a' : 'none'} />
        ))}

      {/* Extras */}
      {mood === 'sick' && <path d="M24.5 4.5 q1.4 2 0 3 q-1.4 -1 0 -3z" fill="#9bd7ff" className="pet-sweat" />}
      {mood === 'sleeping' && (
        <text x="22" y="4" fontSize="6.5" fill="currentColor" fontWeight="700" className="pet-z">
          z
        </text>
      )}
      {mood === 'dirty' && (
        <g className="pet-flies" fill="#4b5563">
          <circle cx="-2" cy="4" r="0.9" />
          <circle cx="30" cy="9" r="0.8" />
          <path d="M6 -1.5 q1 -1.5 0 -3 q-1 -1.5 0 -3 M11 -1 q1 -1.5 0 -3 q-1 -1.5 0 -3" stroke="#84cc16" strokeWidth="0.9" fill="none" opacity="0.8" />
        </g>
      )}
      {mood === 'bath' && (
        <g fill="white" fillOpacity="0.55" stroke="#9bd7ff" strokeWidth="0.5" className="pet-bubbles">
          <circle cx="-1" cy="20" r="2.2" />
          <circle cx="29" cy="14" r="1.8" />
          <circle cx="25" cy="-1" r="1.4" />
          <circle cx="3" cy="-2" r="1.1" />
        </g>
      )}
    </svg>
  );
}

/* ---- The creature, in the sidebar, and its card ---------------------------- */

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

function Gauge({ icon, label, value }: { icon: string; label: string; value: number }) {
  const tone = value >= 60 ? 'var(--color-chart-7)' : value >= 30 ? 'var(--color-chart-8)' : 'var(--color-chart-3)';
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-center text-[15px]" aria-hidden>
        {icon}
      </span>
      <span className="w-20 text-caption-1-medium text-text-secondary">{label}</span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-chart-track">
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${value}%`, background: tone }} />
      </span>
      <span className="w-9 text-right text-caption-1-medium text-text-tertiary tabular-nums">{value}</span>
    </div>
  );
}

export const Pet: React.FC = () => {
  const { data, updateContainer } = useDashboard();
  const { notify } = useShell();
  const navigate = useNavigate();
  const { stats } = useSystemStats(true);
  const [pet, setPet] = useState<PetState | null>(null);
  const [reclaim, setReclaim] = useState<number | null>(null);
  const [override, setOverride] = useState<PetMood | null>(null);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [hearts, setHearts] = useState<number[]>([]);
  const [evolving, setEvolving] = useState(false);
  const small = useRef<HTMLSpanElement>(null);
  const big = useRef<HTMLDivElement>(null);
  const prevStage = useRef<PetStage | null>(null);
  const jobEnds = useRef<Map<string, number> | null>(null);

  const load = useCallback(() => petApi.get().then(setPet).catch(() => undefined), []);
  const loadReclaim = useCallback(
    () =>
      maintenanceApi
        .prunePreview()
        .then(p => setReclaim(p.containers.bytes + p.dangling.bytes + p.buildCache.bytes + p.volumes.bytes))
        .catch(() => undefined),
    [],
  );
  useEffect(() => {
    load();
    loadReclaim();
    const a = setInterval(load, 5 * 60_000);
    const b = setInterval(loadReclaim, 30 * 60_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [load, loadReclaim]);

  const flash = useCallback((mood: PetMood, ms = 4000) => {
    setOverride(mood);
    window.setTimeout(() => setOverride(m => (m === mood ? null : m)), ms);
  }, []);

  // Eats when an update ends well; bath after a cleanup.
  useEffect(() => {
    const jobs = Object.values(data.updates.jobs);
    const known = jobEnds.current;
    jobEnds.current = new Map(jobs.map(j => [j.container, j.endedAt ?? 0]));
    if (known && jobs.some(j => j.status === 'done' && j.endedAt && known.get(j.container) !== j.endedAt)) flash('eating');
  }, [data.updates.jobs, flash]);
  useEffect(() => {
    const on = (e: Event) => {
      const action = (e as CustomEvent<{ action: string }>).detail?.action;
      if (action === 'bath') {
        flash('bath');
        loadReclaim();
      } else if (action === 'eat') flash('eating');
    };
    window.addEventListener(PET_EVENT, on);
    return () => window.removeEventListener(PET_EVENT, on);
  }, [flash, loadReclaim]);

  // Evolution.
  useEffect(() => {
    if (!pet) return;
    if (prevStage.current && prevStage.current !== pet.stage) {
      setEvolving(true);
      window.setTimeout(() => setEvolving(false), 1600);
      notify(`${STAGE_EMOJI[pet.stage]} ${pet.name} a évolué : ${pet.stageLabel} !`, 'ok');
    }
    prevStage.current = pet.stage;
  }, [pet?.stage]);

  const needs: Needs = needsOf(data, reclaim, stats?.disk.usage ?? null, stats?.cpu.usage ?? null);
  const mood: PetMood = override ?? moodOf(needs, dayPart() === 'night');
  const stage: PetStage = pet?.stage ?? 'baby';
  const smallEyes = useEyes(small, mood === 'sleeping');
  const bigEyes = useEyes(big, mood === 'sleeping');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const caress = async () => {
    setHearts(h => [...h, Date.now()].slice(-8));
    flash('loved', 2500);
    if (!pet?.petsLeft) return;
    const next = await petApi.pet().catch(() => null);
    if (next) setPet(next);
  };

  // Feeding launches the pending image updates right here (it eats as each
  // one ends well); a second click confirms, since containers restart.
  const [feedAsk, setFeedAsk] = useState(false);
  const feeding = Object.values(data.updates.jobs).some(j => !j.endedAt);
  const feed = () => {
    if (!feedAsk) {
      setFeedAsk(true);
      window.setTimeout(() => setFeedAsk(false), 4000);
      return;
    }
    setFeedAsk(false);
    const pending = Object.values(data.updates.containers).filter(c => c.state === 'available' || c.state === 'recreate');
    const queue = updateQueue(pending);
    queue.forEach(c => updateContainer(c.container).catch(err => notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'err')));
    notify(`${pet?.name ?? 'Nexy'} mange ${queue.length} mise${queue.length > 1 ? 's' : ''} à jour 🍖`, 'info');
  };

  const rect = small.current?.getBoundingClientRect();
  const progress = pet?.next ? Math.min(100, ((pet.xp - pet.stageFrom) / (pet.next.from - pet.stageFrom)) * 100) : 100;

  return (
    <>
      <span
        ref={small}
        role="button"
        tabIndex={0}
        aria-label={pet ? `${pet.name}, ${pet.stageLabel.toLowerCase()} : ouvrir sa fiche` : 'Créature du portail'}
        title={pet ? `${pet.name} · ${moodLine(mood, needs, pet.name)}` : undefined}
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(o => !o);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(o => !o);
          }
        }}
        className={cx('pet-mark relative grid size-7 shrink-0 cursor-pointer place-items-center rounded-[9px] text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring', evolving && 'is-evolving')}
      >
        <PetFace stage={stage} mood={mood} size={28} look={smallEyes.look} blink={smallEyes.blink} />
        {mood !== 'happy' && mood !== 'sleeping' && !open && <span aria-hidden className="pet-alert" />}
      </span>

      {open &&
        pet &&
        createPortal(
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-label={`Fiche de ${pet.name}`}
              onClick={e => e.stopPropagation()}
              className="pet-card animate-dialog-in absolute flex w-[310px] flex-col gap-3 rounded-3xl border border-border-button-default bg-background-secondary-default p-4 shadow-waitlist"
              style={{ left: Math.max(12, (rect?.left ?? 16) - 4), top: (rect?.bottom ?? 40) + 12 }}
            >
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="absolute top-3 right-3 grid size-7 cursor-pointer place-items-center rounded-lg text-foreground-icon-tertiary hover:bg-background-tertiary-default">
                <RiCloseLine className="size-4" aria-hidden />
              </button>

              <div className="flex items-center gap-4">
                <div ref={big} className={cx('pet-stage relative grid size-[104px] shrink-0 place-items-center rounded-3xl text-text-secondary', `mood-${mood}`, evolving && 'is-evolving')}>
                  <button type="button" onClick={caress} aria-label={`Caresser ${pet.name}`} className="pet-big cursor-pointer outline-none">
                    <PetFace stage={stage} mood={mood} size={72} look={bigEyes.look} blink={bigEyes.blink} />
                  </button>
                  {hearts.map(h => (
                    <RiHeart3Fill key={h} className="pet-heart pointer-events-none absolute size-5 text-[#ff5c8a]" style={{ left: `${30 + ((h / 7) % 40)}%` }} aria-hidden />
                  ))}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  {renaming ? (
                    <input
                      autoFocus
                      defaultValue={pet.name}
                      maxLength={32}
                      onBlur={async e => {
                        setRenaming(false);
                        const next = await petApi.rename(e.target.value).catch(() => null);
                        if (next) setPet(next);
                      }}
                      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="h-8 w-full rounded-lg border border-border-button-default bg-background-primary-default px-2 text-headline-medium text-text-primary outline-none"
                    />
                  ) : (
                    <button type="button" onClick={() => setRenaming(true)} title="Renommer" className="cursor-text truncate text-left text-headline-medium text-text-primary">
                      {pet.name}
                    </button>
                  )}
                  <span className="text-caption-1-medium text-text-secondary">
                    {STAGE_EMOJI[stage]} {pet.stageLabel} · {days(pet.bornAt) ? `${days(pet.bornAt)} j` : 'né aujourd’hui'}
                  </span>
                  <span className="text-caption-1-regular text-text-tertiary">
                    {pet.streakHours} h sans panne · record {pet.bestStreakHours} h
                  </span>
                </div>
              </div>

              <p className="pet-bubble rounded-2xl bg-background-tertiary-default px-3 py-2 text-body-2-regular text-text-primary">{moodLine(mood, needs, pet.name)}</p>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-caption-1-medium text-text-tertiary">
                  <span>{pet.xp} XP</span>
                  <span>
                    {pet.next ? (stage === 'egg' ? `Éclosion à ${pet.next.from} XP : caresse-le !` : `${pet.next.label} à ${pet.next.from} XP`) : 'Forme ultime atteinte'}
                  </span>
                </div>
                <span className="relative h-2 overflow-hidden rounded-full bg-chart-track">
                  <span className="pet-xp absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress}%` }} />
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <Gauge icon="❤️" label="Santé" value={needs.health} />
                <Gauge icon="🍖" label="Satiété" value={needs.food} />
                <Gauge icon="🫧" label="Propreté" value={needs.clean} />
                <Gauge icon="⚡" label="Énergie" value={needs.energy} />
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={caress} className="pet-btn">
                  💕 Caresser{pet.petsLeft ? ` (${pet.petsLeft})` : ''}
                </button>
                {needs.pending > 0 && (
                  <button type="button" className="pet-btn" disabled={feeding} onClick={feed} title="Lance les mises à jour d’images en attente">
                    {feeding ? '🍖 Il mange…' : feedAsk ? `🍖 Confirmer ? (${needs.pending} conteneur${needs.pending > 1 ? 's' : ''} redémarre${needs.pending > 1 ? 'nt' : ''})` : `🍖 Nourrir (${needs.pending})`}
                  </button>
                )}
                {needs.clean < 90 && (
                  <button
                    type="button"
                    className="pet-btn"
                    onClick={() => {
                      setOpen(false);
                      navigate('/systeme', { viewTransition: true });
                    }}
                  >
                    🛁 Laver
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

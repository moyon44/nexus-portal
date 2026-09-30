import React, { useEffect, useState } from 'react';
import {
  RiCloudLine,
  RiLayoutGridLine,
  RiRainyLine,
  RiSnowyLine,
  RiSunCloudyLine,
  RiSunLine,
  RiHome5Line,
  RiThunderstormsLine,
  RiApps2Line,
  RiLayoutMasonryLine,
  RiListUnordered,
  RiText,
} from '@remixicon/react';
import { useDashboard } from '../store';
import { useSystemStats } from '../hooks/useSystemStats';
import { haApi, weatherApi } from '../api';
import type { HaBarItem } from '../types';
import { formatValue, isNumber, number } from '../lib/ha';
import { useShell, VIEWS, type ViewMode } from '../lib/shell';
import { withViewTransition } from '../lib/actions';
import { Dot, TONE_TEXT, usageTone } from './ui/widget';
import { Sparkline, downsample } from './ui/sparkline';
import { cx } from '../utils/cx';
import { Roll } from './ui/roll';
import { AddMenu } from './AddMenu';

/**
 * One slim bar for everything the home page used to spread over four tiles:
 * greeting and time, service health, host CPU / RAM (with an hour of trend)
 * and disk, the weather, and the page actions. Each part can be switched off
 * in Admin → Thème; the bar wraps on narrow screens.
 */

const greeting = () => {
  const h = new Date().getHours();
  if (h < 6 || h >= 22) return 'Bonne nuit';
  if (h < 18) return 'Bonjour';
  return 'Bonsoir';
};

/** Letter by letter, out of a blur, on the first visit of the day only. */
const GREETED_KEY = 'portail:greeted';
let firstVisitToday: boolean | null = null; // computed once per page load
function useFirstVisitToday() {
  if (firstVisitToday === null) {
    try {
      const today = new Date().toDateString();
      firstVisitToday = window.localStorage.getItem(GREETED_KEY) !== today;
      window.localStorage.setItem(GREETED_KEY, today);
    } catch {
      firstVisitToday = false;
    }
  }
  return firstVisitToday;
}

function Letters({ text, from = 0 }: { text: string; from?: number }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span key={i} className="letter-in" style={{ '--i': from + i } as React.CSSProperties}>
          {ch}
        </span>
      ))}
    </>
  );
}

const pct = (v: number) => `${Math.round(v)} %`;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function WeatherIcon({ code, className }: { code?: string; className?: string }) {
  const Icon = !code
    ? RiSunCloudyLine
    : code.startsWith('01')
      ? RiSunLine
      : code.startsWith('02')
        ? RiSunCloudyLine
        : /^0[34]|^50/.test(code)
          ? RiCloudLine
          : code.startsWith('11')
            ? RiThunderstormsLine
            : code.startsWith('13')
              ? RiSnowyLine
              : RiRainyLine;
  return <Icon className={className} aria-hidden />;
}

/**
 * The status bar's Home Assistant readout: a weather entity as the outside
 * (icon, temperature, condition on hover), then the house's own values after
 * a house icon, full names on hover.
 */
function HomeReadout({ items }: { items: HaBarItem[] }) {
  const outside = items.filter(e => e.domain === 'weather');
  const inside = items.filter(e => e.domain !== 'weather');
  const short = (e: HaBarItem) =>
    e.deviceClass === 'temperature' && isNumber(e.state) ? `${number(Number(e.state))}°` : formatValue(e);
  return (
    <>
      <Divider />
      <span className="flex items-center gap-3 text-body-2-regular">
        {outside.map(e => (
          <span
            key={e.id}
            className="flex items-center gap-1.5"
            title={`${e.condition ?? ''}${e.humidity !== null ? ` · humidité ${e.humidity} %` : ''} · ${e.name}`}
          >
            <WeatherIcon code={e.icon ?? undefined} className="size-[18px] text-foreground-icon-secondary" />
            {isNumber(e.state) ? (
              <span className="text-body-2-medium text-text-primary tabular-nums">
                <Roll value={Math.round(Number(e.state))} />°
              </span>
            ) : null}
            <span className="text-text-tertiary">dehors</span>
          </span>
        ))}
        {inside.length > 0 && (
          <span className="flex items-center gap-1.5" title={inside.map(e => `${e.name} : ${formatValue(e)}`).join('\n')}>
            <RiHome5Line className="size-[18px] text-foreground-icon-secondary" aria-hidden />
            {inside.map((e, i) => (
              <span key={e.id} className={cx('tabular-nums', i === 0 ? 'text-body-2-medium text-text-primary' : 'text-text-tertiary')}>
                {i > 0 && <span aria-hidden className="mr-1.5 text-text-tertiary">·</span>}
                {short(e)}
              </span>
            ))}
          </span>
        )}
      </span>
    </>
  );
}

function Divider() {
  return <span aria-hidden className="hidden h-6 w-px bg-separator-border md:block" />;
}

function Metric({
  label,
  value,
  series,
  title,
}: {
  label: string;
  value: number;
  series?: number[];
  title?: string;
}) {
  const tone = usageTone(value);
  return (
    <span className="flex items-center gap-2" title={title}>
      <span className="text-body-2-regular text-text-tertiary">{label}</span>
      <span className={cx('text-body-2-medium tabular-nums', tone === 'ok' ? 'text-text-primary' : TONE_TEXT[tone])}>
        <Roll value={Math.round(value)} />
        {'\u202f%'}
      </span>
      {series && (
        <Sparkline
          values={series}
          className={tone === 'err' ? 'text-chart-3' : tone === 'warn' ? 'text-chart-8' : undefined}
          label={`${label} sur une heure : ${pct(Math.min(...series))} à ${pct(Math.max(...series))}`}
        />
      )}
    </span>
  );
}

const VIEW_ICONS: Record<ViewMode, typeof RiApps2Line> = {
  cards: RiLayoutGridLine,
  list: RiListUnordered,
  icons: RiApps2Line,
  bento: RiLayoutMasonryLine,
  text: RiText,
};

/** Five display styles; the chosen one sits on a sliding pill. V cycles. */
function ViewSwitcher() {
  const { view, setView } = useShell();
  return (
    <div role="radiogroup" aria-label="Style d'affichage" className="relative flex items-center gap-0.5 rounded-xl bg-background-tertiary-default/60 p-0.5">
      {VIEWS.map(v => {
        const Icon = VIEW_ICONS[v.key];
        const on = view === v.key;
        return (
          <button
            key={v.key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={v.label}
            title={`${v.label} (V pour changer)`}
            onClick={() => setView(v.key)}
            className={cx(
              'grid size-7 cursor-pointer place-items-center rounded-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus-ring',
              on ? 'bg-background-secondary-default text-foreground-icon-primary shadow-card' : 'text-foreground-icon-secondary hover:text-foreground-icon-primary',
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

export const StatusBar: React.FC = () => {
  const { data, isLoading } = useDashboard();
  const { theme } = data;
  const { issuesOnly, setIssuesOnly } = useShell();
  const now = useClock();
  const writeIn = useFirstVisitToday();
  const showStats = theme.showSystemStats !== false;
  const { stats } = useSystemStats(showStats);
  const [weather, setWeather] = useState<any>(null);

  // Home Assistant entities chosen for the status bar take the weather's place
  // (Système → Home Assistant); without any, the city weather stays.
  const [home, setHome] = useState<HaBarItem[] | null>(null);
  useEffect(() => {
    if (!theme.showWeather) return;
    const load = () => haApi.statusbar().then(setHome).catch(() => setHome([]));
    load();
    const t = setInterval(() => !document.hidden && load(), 60_000);
    return () => clearInterval(t);
  }, [theme.showWeather]);

  useEffect(() => {
    if (!theme.showWeather || home === null || home.length) return;
    const load = () => weatherApi.get().then(setWeather).catch(() => setWeather(null));
    load();
    const t = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [theme.showWeather, theme.weatherCity, home]);

  const visible = data.services.filter(s => s.isVisible);
  const down = visible.filter(s => s.status === 'offline').length;
  const up = visible.filter(s => s.status === 'online').length;

  const history = stats?.history ?? [];
  const cpuSeries = downsample(history.map(h => h.cpu), 40);
  const ramSeries = downsample(history.map(h => h.ram), 40);

  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const name = theme.userName?.trim();

  return (
    <header
      className={cx(
        // Above the sections: the "Ajouter" menu drops over the poster wall.
        'relative z-30 flex flex-wrap items-end gap-x-6 gap-y-3 px-1 pt-2 pb-1',
        'min-h-[68px] animate-rise-in',
      )}
    >
      {/* Greeting · time; the date lives here only */}
      <div className="flex min-w-0 flex-col">
        <p
          className={cx(
            'greeting truncate text-text-primary',
            theme.skin === 'paper'
              ? 'paper-hand text-[44px] leading-[48px]'
              : 'font-[Geist,var(--font-sans)] text-[30px] leading-10 font-semibold tracking-[-0.02em]',
          )}
        >
          {writeIn ? <Letters text={greeting()} /> : greeting()}
          {name && (
            <>
              {' '}
              <span
                className={cx(
                  'greeting-name',
                  theme.skin === 'paper'
                    ? 'text-text-primary underline decoration-[#c9a45c] decoration-wavy decoration-2 underline-offset-8'
                    : 'bg-linear-to-r from-accent-300 via-accent-400 to-[#c084fc] bg-clip-text text-transparent',
                  writeIn && 'letter-in',
                )}
                style={writeIn ? ({ '--i': greeting().length + 2 } as React.CSSProperties) : undefined}
              >
                {name}
              </span>
            </>
          )}
          {theme.showClock && (
            <>
              <span className="text-text-tertiary"> · </span>
              <time className="tabular-nums" dateTime={now.toISOString()}>
                <Roll value={time} />
              </time>
            </>
          )}
        </p>
        <p className="truncate text-body-2-regular text-text-tertiary first-letter:uppercase">{date}</p>
      </div>
      <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-3 pb-0.5">

      {/* Health: quiet when all is well, loud when something is down */}
      <button
        type="button"
        onClick={() => withViewTransition(() => setIssuesOnly(!issuesOnly))}
        disabled={down === 0 && !issuesOnly}
        aria-pressed={issuesOnly}
        title={down > 0 ? 'Afficher uniquement les services hors ligne' : 'Tous les services répondent'}
        className={cx(
          '-mx-2 flex items-center gap-2 rounded-xl px-2 py-1 text-body-2-medium outline-none transition-colors',
          'focus-visible:ring-2 focus-visible:ring-border-focus-ring enabled:cursor-pointer enabled:hover:bg-background-secondary-hover',
          issuesOnly && 'bg-status-rose-background',
        )}
      >
        <Dot tone={down > 0 ? 'err' : visible.length ? 'ok' : 'idle'} pulse={down > 0} />
        {down > 0 ? (
          <span className="text-status-rose-text tabular-nums">
            {down} hors ligne
            <span className="text-text-tertiary"> · {up}/{visible.length}</span>
          </span>
        ) : (
          <span className="text-text-primary tabular-nums">
            {isLoading && !visible.length ? '–' : `${up}/${visible.length}`}
            <span className="font-normal text-text-tertiary"> services</span>
          </span>
        )}
      </button>

      {showStats && stats && (
        <>
          <Divider />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Metric label="CPU" value={stats.cpu.usage} series={cpuSeries} title={`${stats.cpu.count} cœurs · ${stats.cpu.model}`} />
            <Metric label="RAM" value={stats.memory.usage} series={ramSeries} />
            <Metric
              label="Disque"
              value={stats.disk.usage}
              title={`${Math.round(stats.disk.free / 1024 ** 3)} Go libres sur ${Math.round(stats.disk.total / 1024 ** 3)} Go`}
            />
          </div>
        </>
      )}

      {theme.showWeather && home && home.length > 0 && <HomeReadout items={home} />}

      {theme.showWeather && home?.length === 0 && weather && (
        <>
          <Divider />
          <span
            className="flex items-center gap-1.5 text-body-2-regular"
            title={weather.descriptionFr || weather.description}
          >
            <WeatherIcon code={weather.icon} className="size-[18px] text-foreground-icon-secondary" />
            <span className="text-body-2-medium text-text-primary tabular-nums"><Roll value={Math.round(weather.temp)} />°</span>
            <span className="text-text-tertiary">{weather.city}</span>
          </span>
        </>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <ViewSwitcher />
        <AddMenu />
      </div>
      </div>
    </header>
  );
};

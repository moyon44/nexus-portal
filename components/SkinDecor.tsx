import React, { useEffect, useState } from 'react';
import type { Service } from '../types';
import type { Skin } from '../theme/skins';
import { reducedMotion } from '../lib/motion';
import { useShell } from '../lib/shell';
import { openService } from '../lib/actions';
import { useDashboard } from '../store';
import { LinkIcon } from './LinkIcon';

/**
 * The parts of a style that CSS alone can't draw (styles/skins.css does
 * the rest):
 *   Terminal   scanlines and screen curvature over everything, BIOS boot
 *   Verre      the SVG displacement filter the glass tiles refract through
 *   Plan       the title block (cartouche) and north arrow
 *   Synthwave  the sky: stars, striped sun, neon grid floor
 *   Windows 98 the taskbar: Start (opens the palette), favourites (or most used) as tasks, tray clock
 */
export const SkinDecor: React.FC<{ skin: Skin | undefined; services: Service[]; userName?: string }> = ({ skin, services, userName }) => {
  // Studio styles: vignette / scanlines layer, shown by styles/skins.css.
  if (skin?.startsWith('custom:')) return <div aria-hidden className="cs-overlay" />;
  switch (skin) {
    case 'terminal':
      return (
        <>
          <div aria-hidden className="crt-overlay" />
          <BootSequence services={services} />
        </>
      );
    case 'glass':
      return <GlassFilter />;
    case 'blueprint':
      return <TitleBlock userName={userName} />;
    case 'synthwave':
      return (
        <div aria-hidden className="sw-sky">
          <div className="sw-stars" />
          <div className="sw-sun" />
          <div className="sw-floor">
            <div className="sw-grid" />
          </div>
        </div>
      );
    case 'win98':
      return <Taskbar services={services} />;
    default:
      return null;
  }
};

/* ---- Windows 98: taskbar along the bottom of the window. ---- */

function Taskbar({ services }: { services: Service[] }) {
  const { openPalette } = useShell();
  const { data, logAccess } = useDashboard();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  // Favourites as open "tasks"; without any, the most used services.
  const favourites = services.filter(s => s.isFavorite);
  const tasks = (favourites.length ? favourites : [...services].sort((a, b) => (data.usage[b.id] ?? 0) - (data.usage[a.id] ?? 0))).slice(0, 6);
  const down = services.filter(s => s.status === 'offline').length;
  return (
    <div className="w98-taskbar">
      <button type="button" className="w98-start" onClick={openPalette} title="Rechercher, ouvrir, lancer une action (Ctrl K)">
        <svg viewBox="0 0 16 16" aria-hidden className="size-4">
          <path d="M1 3.2 7.2 2.3v5.3H1z" fill="#f03a17" />
          <path d="M8 2.2 15 1.2v6.4H8z" fill="#7fba00" />
          <path d="M1 8.4h6.2v5.3L1 12.8z" fill="#00a4ef" />
          <path d="M8 8.4h7v6.4l-7-1z" fill="#ffb900" />
        </svg>
        Démarrer
      </button>
      <span className="w98-sep" aria-hidden />
      <div className="w98-tasks">
        {tasks.map(s => (
          <button
            key={s.id}
            type="button"
            className="w98-task"
            title={s.name}
            onClick={() => {
              logAccess(s.id);
              openService(s);
            }}
          >
            <LinkIcon service={s} size={14} />
            <span className="truncate">{s.name}</span>
          </button>
        ))}
      </div>
      <div className="w98-tray" title={down ? `${down} service(s) hors ligne` : 'Tous les services répondent'}>
        <span aria-hidden className={down ? 'text-[#c00000]' : 'text-[#008000]'}>●</span>
        <time dateTime={now.toISOString()}>{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
    </div>
  );
}

/* ---- Terminal: BIOS boot, once per browser session (any key skips). ---- */

const BOOT_KEY = 'portail:booted';

function BootSequence({ services }: { services: Service[] }) {
  const [lines, setLines] = useState<string[] | null>(() => {
    try {
      return window.sessionStorage.getItem(BOOT_KEY) || reducedMotion() ? null : [];
    } catch {
      return null;
    }
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (lines === null) return;
    try {
      window.sessionStorage.setItem(BOOT_KEY, '1');
    } catch {
      // Boots again next time.
    }
    const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n, '.'));
    const script = [
      'NEXUS BIOS v2.6.0  (C) 2026 Nexus Systems',
      '',
      `CPU : ${navigator.hardwareConcurrency || 4} coeurs détectés`,
      'Mémoire : 65536K OK',
      '',
      'Détection des services…',
      ...services.slice(0, 12).map(s => `  ${pad(s.name.toLowerCase(), 26)} ${s.status === 'offline' ? '[ÉCHEC]' : '[ OK ]'}`),
      ...(services.length > 12 ? [`  … et ${services.length - 12} autres`] : []),
      '',
      'Démarrage de nexus-portal…',
      '> PRÊT_',
    ];
    const timers: number[] = [];
    script.forEach((line, i) => timers.push(window.setTimeout(() => setLines(l => [...(l ?? []), line]), 60 + i * 85)));
    const end = 60 + script.length * 85 + 450;
    timers.push(window.setTimeout(() => setLeaving(true), end));
    timers.push(window.setTimeout(() => setLines(null), end + 450));
    const skip = () => {
      setLeaving(true);
      timers.push(window.setTimeout(() => setLines(null), 300));
    };
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
    // Runs once, with the services known at boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines === null]);

  if (lines === null) return null;
  return (
    <div className="crt-boot" data-leaving={leaving || undefined} aria-hidden>
      <pre>{lines.join('\n')}</pre>
    </div>
  );
}

/* ---- Verre liquide: displacement filter, Chromium only (backdrop-filter: url()). ---- */

function GlassFilter() {
  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
    const chromium = brands.some(b => /Chromium/i.test(b.brand));
    if (chromium) document.documentElement.dataset.refract = '';
    return () => {
      delete document.documentElement.dataset.refract;
    };
  }, []);
  return (
    <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
      <filter id="liquid-glass" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.009 0.012" numOctaves="2" seed="4" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="46" xChannelSelector="R" yChannelSelector="G" result="bent" />
        <feGaussianBlur in="bent" stdDeviation="1.2" />
      </filter>
    </svg>
  );
}

/* ---- Plan: title block in the bottom-right corner, north arrow above it. ---- */

function TitleBlock({ userName }: { userName?: string }) {
  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
  return (
    <div aria-hidden className="bp-cartouche">
      <svg viewBox="0 0 40 52" className="bp-north">
        <circle cx="20" cy="32" r="17" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M20 12 L27 40 L20 34 L13 40 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M20 12 L20 34 L13 40 Z" fill="currentColor" />
        <text x="20" y="8" textAnchor="middle" fontSize="8" fill="currentColor">N</text>
      </svg>
      <table>
        <tbody>
          <tr>
            <td colSpan={2} className="bp-title">NEXUS PORTAL</td>
          </tr>
          <tr>
            <td colSpan={2}>Plan d’ensemble · services</td>
          </tr>
          <tr>
            <td>Éch. 1:1</td>
            <td>Feuille 1/1</td>
          </tr>
          <tr>
            <td>Dess. {userName?.trim() || 'admin'}</td>
            <td>{date}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

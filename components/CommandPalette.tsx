import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RiAddLine,
  RiAlarmWarningLine,
  RiApps2Line,
  RiBrushLine,
  RiPaletteLine,
  RiSparkling2Line,
  RiCursorLine,
  RiSpeedUpLine,
  RiAppleLine,
  RiKeyboardLine,
  RiArrowRightLine,
  RiComputerLine,
  RiCornerDownLeftLine,
  RiHome5Line,
  RiLayoutGridLine,
  RiMoonLine,
  RiPulseLine,
  RiRadarLine,
  RiRestartLine,
  RiSearchLine,
  RiSettings4Line,
  RiSunLine,
  RiTerminalBoxLine,
  RiMovie2Line,
  RiTv2Line,
  RiFileLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiCloudLine,
  RiGlobalLine,
} from '@remixicon/react';
import { useDashboard } from '../store';
import { useShell, VIEWS } from '../lib/shell';
import {
  categoryKeys,
  containerOf,
  openService,
  openSsh,
  restartContainer,
  sshTargetFor,
  withViewTransition,
} from '../lib/actions';
import { treeOrder } from '../lib/links';
import { folderTint } from '../theme/folders';
import { dockerApi, integrationsApi, searchApi } from '../api';
import { applyTheme } from '../theme/theme';
import { allSkins } from '../theme/skins';
import { openWrapped } from './Wrapped';
import { openStudio } from './Studio';
import { cursorEnabled, setCursorEnabled } from './FancyCursor';
import { liteEnabled, setLite } from '../lib/lite';
import { startGravity } from './Gravity';
import { armFlip, themeReveal } from '../lib/motion';
import type { NcAction, NcFile, SeerrResult, Service } from '../types';
import { LinkIcon } from './LinkIcon';
import { Kbd } from './ui/badge';
import type { IconComponent } from './ui/button';
import { cx } from '../utils/cx';

/**
 * The one search of the app (Ctrl K or /), in the Raycast / Linear mould:
 * type to find a link, a category or an action. Enter runs the highlighted
 * row; Ctrl+Enter opens a link in a new tab. Restarting a container asks for
 * a second Enter. From 3 letters it also searches Nextcloud ("Fichiers") and
 * Jellyseerr ("Demandes": Enter twice requests a film or a series), and the
 * web through SearXNG ("Web", last so it never pushes your own things down).
 */

type Group = 'Liens' | 'Catégories' | 'Actions' | 'Pages' | 'Fichiers' | 'Demandes' | 'Web';

type Entry = {
  id: string;
  group: Group;
  label: string;
  sub?: string;
  /** Extra words that should match (host, container, synonyms). */
  keywords?: string;
  icon:
    | { kind: 'service'; service: Service }
    | { kind: 'icon'; icon: IconComponent }
    | { kind: 'dot'; color: string }
    | { kind: 'poster'; url: string | null; fallback: IconComponent };
  keys?: string[];
  danger?: boolean;
  confirm?: string;
  run: (opts: { newTab: boolean }) => void | Promise<void>;
  /** Hidden until the query is at least this long (per-service actions). */
  minQuery?: number;
};

const GROUPS: Group[] = ['Liens', 'Catégories', 'Actions', 'Pages'];

/** `occ` actions the backend allows (services/nextcloud.ts). */
const NC_ACTIONS: { key: NcAction; label: string; keywords: string }[] = [
  { key: 'upgrade', label: 'Terminer la mise à jour', keywords: 'occ upgrade base' },
  { key: 'cron', label: 'Lancer les tâches de fond', keywords: 'cron background jobs' },
  { key: 'scan', label: 'Rescanner les fichiers', keywords: 'files scan occ' },
  { key: 'apps', label: 'Mettre à jour les apps', keywords: 'app update occ' },
  { key: 'indices', label: 'Ajouter les index manquants', keywords: 'db indices base occ' },
  { key: 'maintenance-on', label: 'Activer le mode maintenance', keywords: 'maintenance fermer occ' },
  { key: 'maintenance-off', label: 'Quitter le mode maintenance', keywords: 'maintenance ouvrir occ' },
];

const SEERR_SUB: Record<SeerrResult['status'], string> = {
  none: 'Entrée pour demander',
  partial: 'En partie disponible · Entrée pour demander le reste',
  requested: 'Déjà demandé',
  available: 'Déjà disponible',
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const { data, updateTheme, refetch, logAccess } = useDashboard();
  const shell = useShell();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [seerr, setSeerr] = useState<SeerrResult[]>([]);
  const [files, setFiles] = useState<NcFile[]>([]);
  const [web, setWeb] = useState<{ title: string; url: string; content: string }[]>([]);
  const [seerrBusy, setSeerrBusy] = useState(false);
  const [ncOn, setNcOn] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    integrationsApi
      .getAll()
      .then(list => setNcOn(list.some(i => i.type === 'nextcloud' && i.enabled && i.url)))
      .catch(() => undefined);
  }, [isOpen]);

  // Jellyseerr search, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    setSeerr([]);
    setFiles([]);
    setWeb([]);
    if (!isOpen || q.length < 3) {
      setSeerrBusy(false);
      return;
    }
    const ctrl = new AbortController();
    setSeerrBusy(true);
    const t = window.setTimeout(() => {
      Promise.all([
        integrationsApi.seerrSearch(q, ctrl.signal).then(setSeerr).catch(() => undefined),
        searchApi.web(q, ctrl.signal).then(r => !ctrl.signal.aborted && setWeb(r)).catch(() => undefined),
        // Nextcloud and kDrive share the "Fichiers" group, Nextcloud first.
        Promise.all([
          integrationsApi.ncSearch(q, ctrl.signal).catch(() => []),
          integrationsApi.kdriveSearch(q, ctrl.signal).catch(() => []),
        ]).then(([nc, kd]) => !ctrl.signal.aborted && setFiles([...nc, ...kd])),
      ]).finally(() => !ctrl.signal.aborted && setSeerrBusy(false));
    }, 350);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query, isOpen]);

  const all = useMemo<Entry[]>(() => {
    const services = treeOrder(data.services, data.categories);
    const favorites = services.filter(s => s.isFavorite);
    const keys = categoryKeys(data.categories);
    const down = services.filter(s => s.status === 'offline').length;
    const compact = data.theme.density === 'compact';
    const server = data.theme.sshTarget?.trim();

    // Most used first when nothing is typed yet.
    const byUsage = [...services].sort((a, b) => (data.usage[b.id] ?? 0) - (data.usage[a.id] ?? 0));
    const links: Entry[] = byUsage.map(s => {
      const fav = favorites.indexOf(s);
      return {
        id: `link-${s.id}`,
        group: 'Liens',
        label: s.name,
        sub: s.description || s.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        keywords: `${s.url} ${s.tags.join(' ')} ${data.categories.find(c => c.id === s.categoryId)?.name ?? ''}`,
        icon: { kind: 'service', service: s },
        keys: fav >= 0 && fav < 9 ? [String(fav + 1)] : undefined,
        run: ({ newTab }) => {
          logAccess(s.id);
          openService(s, newTab || s.openInNewTab);
        },
      };
    });

    const categories: Entry[] = [...data.categories]
      .sort((a, b) => a.order - b.order)
      .map(c => ({
        id: `cat-${c.id}`,
        group: 'Catégories',
        label: c.name,
        sub: `${services.filter(s => s.categoryId === c.id).length} liens`,
        icon: { kind: 'dot', color: folderTint(c.color) },
        keys: keys.get(c.id) ? ['G', keys.get(c.id)!.toUpperCase()] : undefined,
        run: () => shell.goToCategory(c.id),
      }));

    const setMode = (mode: 'light' | 'dark' | 'auto') => {
      // Revealed from the top centre, where the palette was.
      themeReveal(window.innerWidth / 2, window.innerHeight * 0.15, () => {
        applyTheme({ mode, primaryColor: data.theme.primaryColor, skin: data.theme.skin });
        void updateTheme({ mode }).catch(() => undefined);
      });
    };

    const actions: Entry[] = [
      {
        id: 'act-add',
        group: 'Actions',
        label: 'Ajouter un lien',
        keywords: 'nouveau lien url',
        icon: { kind: 'icon', icon: RiAddLine },
        keys: ['N'],
        run: () => shell.openQuickAdd(),
      },
      ...(down > 0 || shell.issuesOnly
        ? [
            {
              id: 'act-issues',
              group: 'Actions' as Group,
              label: shell.issuesOnly ? 'Afficher tous les services' : `Afficher les services hors ligne (${down})`,
              keywords: 'panne incident erreur filtre',
              icon: { kind: 'icon' as const, icon: RiAlarmWarningLine },
              run: () => {
                navigate('/');
                withViewTransition(() => shell.setIssuesOnly(!shell.issuesOnly));
              },
            },
          ]
        : []),
      {
        id: 'act-density',
        group: 'Actions',
        label: compact ? 'Affichage confortable' : 'Affichage compact',
        keywords: 'densite mode grille',
        icon: { kind: 'icon', icon: compact ? RiLayoutGridLine : RiApps2Line },
        run: () => {
          armFlip();
          void updateTheme({ density: compact ? 'normal' : 'compact' }).catch(() => undefined);
        },
      },
      ...VIEWS.filter(v => v.key !== shell.view).map<Entry>(v => ({
        id: `view-${v.key}`,
        group: 'Actions',
        label: `Affichage : ${v.label}`,
        keywords: 'style vue mode disposition',
        icon: { kind: 'icon', icon: RiLayoutGridLine },
        keys: ['V'],
        run: () => {
          navigate('/');
          shell.setView(v.key);
        },
      })),
      {
        id: 'act-wrapped',
        group: 'Actions',
        label: 'Nexus Wrapped',
        sub: 'Ton mois en histoire',
        keywords: 'bilan recap stats mois resume spotify',
        icon: { kind: 'icon', icon: RiSparkling2Line },
        run: () => openWrapped(),
      },
      {
        id: 'act-wrapped-prev',
        group: 'Actions',
        label: 'Nexus Wrapped du mois dernier',
        keywords: 'bilan recap stats mois precedent',
        icon: { kind: 'icon', icon: RiSparkling2Line },
        minQuery: 2,
        run: () => {
          const d = new Date();
          const prev = new Date(d.getFullYear(), d.getMonth() - 1, 15);
          openWrapped(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
        },
      },
      {
        id: 'act-studio',
        group: 'Actions',
        label: 'Studio de style',
        sub: 'Créer ton propre style',
        keywords: 'skin theme creer editeur couleurs personnaliser',
        icon: { kind: 'icon', icon: RiPaletteLine },
        run: () => openStudio(),
      },
      ...allSkins(data.customSkins).filter(k => k.key !== (data.theme.skin ?? 'default')).map<Entry>(k => ({
        id: `skin-${k.key}`,
        group: 'Actions',
        label: `Style : ${k.label}`,
        keywords: 'skin theme apparence look',
        icon: { kind: 'icon', icon: RiBrushLine },
        run: () =>
          themeReveal(window.innerWidth / 2, window.innerHeight * 0.15, () => {
            applyTheme({ ...data.theme, skin: k.key });
            void updateTheme({ skin: k.key }).catch(() => undefined);
          }),
      })),
      {
        id: 'act-shortcuts',
        group: 'Actions',
        label: 'Raccourcis clavier',
        sub: 'Toutes les touches · aussi avec ?',
        keywords: 'aide help clavier keyboard touches shortcuts raccourci',
        icon: { kind: 'icon', icon: RiKeyboardLine },
        run: () => shell.openHelp(),
      },
      {
        id: 'act-gravity',
        group: 'Actions',
        label: 'Gravité',
        sub: 'Les tuiles tombent · tapez « boum » n’importe où',
        keywords: 'physique chute easter egg boum',
        icon: { kind: 'icon', icon: RiAppleLine },
        run: () => {
          navigate('/');
          window.setTimeout(startGravity, 250);
        },
      },
      {
        id: 'act-cursor',
        group: 'Actions',
        label: cursorEnabled() ? 'Curseur classique' : 'Curseur animé',
        sub: 'Sur cet appareil',
        keywords: 'souris pointeur trainee aimant',
        icon: { kind: 'icon', icon: RiCursorLine },
        run: () => setCursorEnabled(!cursorEnabled()),
      },
      {
        id: 'act-lite',
        group: 'Actions',
        label: liteEnabled() ? 'Effets complets' : 'Mode léger',
        sub: 'Sur cet appareil',
        keywords: 'performance lent rame fluide latence animations flou',
        icon: { kind: 'icon', icon: RiSpeedUpLine },
        run: () => setLite(!liteEnabled()),
      },
      {
        id: 'act-light',
        group: 'Actions',
        label: 'Thème clair',
        keywords: 'mode jour light',
        icon: { kind: 'icon', icon: RiSunLine },
        run: () => setMode('light'),
      },
      {
        id: 'act-dark',
        group: 'Actions',
        label: 'Thème sombre',
        keywords: 'mode nuit dark',
        icon: { kind: 'icon', icon: RiMoonLine },
        run: () => setMode('dark'),
      },
      {
        id: 'act-auto',
        group: 'Actions',
        label: 'Thème du système',
        keywords: 'mode auto',
        icon: { kind: 'icon', icon: RiComputerLine },
        run: () => setMode('auto'),
      },
      ...(server
        ? [
            {
              id: 'act-ssh-server',
              group: 'Actions' as Group,
              label: 'SSH sur le serveur',
              sub: server,
              keywords: 'terminal console shell',
              icon: { kind: 'icon' as const, icon: RiTerminalBoxLine },
              run: async () => {
                await openSsh(server);
                shell.notify(`Commande copiée : ssh ${server}`, 'ok');
              },
            },
          ]
        : []),
      {
        id: 'act-discover',
        group: 'Actions',
        label: 'Détecter les conteneurs Docker',
        sub: 'Labels nexus.name, nexus.url, nexus.group',
        keywords: 'docker decouverte labels synchroniser',
        icon: { kind: 'icon', icon: RiRadarLine },
        run: async () => {
          try {
            const found = await dockerApi.getDiscovered();
            await refetch();
            shell.notify(
              found.length ? `${found.length} conteneur${found.length > 1 ? 's' : ''} avec labels nexus.*` : 'Aucun conteneur avec des labels nexus.*',
              'ok',
            );
          } catch {
            shell.notify('Découverte Docker indisponible', 'err');
          }
        },
      },
      ...(ncOn
        ? NC_ACTIONS.map<Entry>(a => ({
            id: `nc-${a.key}`,
            group: 'Actions',
            label: `Nextcloud : ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}`,
            sub: 'occ dans le conteneur',
            keywords: `nextcloud cloud ${a.keywords}`,
            icon: { kind: 'icon', icon: RiCloudLine },
            confirm: `Entrée pour confirmer : ${a.label.toLowerCase()} (Nextcloud)`,
            minQuery: 2,
            run: async () => {
              try {
                await integrationsApi.ncAction(a.key);
              } catch (e) {
                shell.notify(e instanceof Error ? e.message : 'Action impossible', 'err');
                return;
              }
              shell.notify(`Nextcloud : ${a.label.toLowerCase()}…`, 'info');
              // Runs in the background: say how it ended.
              const poll = window.setInterval(async () => {
                const st = await integrationsApi.ncActionState().catch(() => null);
                if (!st || st.status === 'running') return;
                window.clearInterval(poll);
                shell.notify(
                  st.status === 'done' ? `Nextcloud : ${a.label.toLowerCase()} ✓` : `Nextcloud : échec (${st.output.split('\n').pop() || 'voir les logs'})`,
                  st.status === 'done' ? 'ok' : 'err',
                );
              }, 3000);
            },
          }))
        : []),
      // Per-service actions: shown once the query narrows things down.
      ...services.flatMap<Entry>(s => {
        const container = containerOf(s);
        const out: Entry[] = [];
        if (container) {
          out.push({
            id: `restart-${s.id}`,
            group: 'Actions',
            label: `Redémarrer ${s.name}`,
            sub: `Conteneur ${container}`,
            keywords: `restart docker conteneur ${container}`,
            icon: { kind: 'icon', icon: RiRestartLine },
            danger: true,
            confirm: `Entrée pour confirmer le redémarrage de ${container}`,
            minQuery: 2,
            run: async () => {
              shell.notify(`Redémarrage de ${container}…`, 'ok');
              try {
                await restartContainer(container);
                shell.notify(`${container} redémarré`, 'ok');
              } catch {
                shell.notify(`Impossible de redémarrer ${container}`, 'err');
              }
            },
          });
        }
        const ssh = sshTargetFor(s, undefined);
        if (ssh) {
          const target = sshTargetFor(s, server)!;
          out.push({
            id: `ssh-${s.id}`,
            group: 'Actions',
            label: `SSH vers ${s.name}`,
            sub: target,
            keywords: 'terminal console',
            icon: { kind: 'icon', icon: RiTerminalBoxLine },
            minQuery: 2,
            run: async () => {
              await openSsh(target);
              shell.notify(`Commande copiée : ssh ${target}`, 'ok');
            },
          });
        }
        return out;
      }),
    ];

    const pages: Entry[] = [
      { id: 'page-home', group: 'Pages', label: 'Accueil', icon: { kind: 'icon', icon: RiHome5Line }, run: () => navigate('/', { viewTransition: true }) },
      {
        id: 'page-system',
        group: 'Pages',
        label: 'Système',
        sub: 'Serveur et conteneurs',
        keywords: 'docker cpu ram conteneurs serveur',
        icon: { kind: 'icon', icon: RiPulseLine },
        run: () => navigate('/systeme', { viewTransition: true }),
      },
      {
        id: 'page-fichiers',
        group: 'Pages',
        label: 'Fichiers',
        sub: 'Nextcloud et kDrive',
        keywords: 'nextcloud kdrive stockage documents dossiers cloud explorateur',
        icon: { kind: 'icon', icon: RiFolderOpenLine },
        run: () => navigate('/fichiers', { viewTransition: true }),
      },
      {
        id: 'page-maison',
        group: 'Pages',
        label: 'Maison',
        sub: 'Widgets Home Assistant',
        keywords: 'domotique widgets home assistant lumieres volets capteurs',
        icon: { kind: 'icon', icon: RiHome5Line },
        run: () => navigate('/maison', { viewTransition: true }),
      },
      {
        id: 'page-ha',
        group: 'Pages',
        label: 'Home Assistant',
        sub: 'Capteurs de la maison',
        keywords: 'domotique capteurs sensor temperature maison ha',
        icon: { kind: 'icon', icon: RiPulseLine },
        run: () => navigate('/systeme/home-assistant', { viewTransition: true }),
      },
      {
        id: 'page-admin',
        group: 'Pages',
        label: 'Administration',
        keywords: 'reglages parametres admin',
        icon: { kind: 'icon', icon: RiSettings4Line },
        keys: ['Ctrl', ','],
        run: () => navigate('/admin', { viewTransition: true }),
      },
    ];

    return [...links, ...categories, ...actions, ...pages];
  }, [data, shell, navigate, updateTheme, refetch, logAccess, ncOn]);

  const entries = useMemo(() => {
    const q = normalize(query.trim());
    const words = q.split(/\s+/).filter(Boolean);
    const matched = all.filter(e => {
      if (e.minQuery && q.length < e.minQuery) return false;
      if (!words.length) return true;
      const hay = normalize(`${e.label} ${e.sub ?? ''} ${e.keywords ?? ''}`);
      return words.every(w => hay.includes(w));
    });
    // Within each group, names that start with the query come first.
    const rank = (e: Entry) => (q && normalize(e.label).startsWith(q) ? 0 : 1);
    const local = GROUPS.flatMap(g => matched.filter(e => e.group === g).sort((a, b) => rank(a) - rank(b)));
    // Jellyseerr hits come last, so their late arrival doesn't move the selection.
    const requests = seerr.map<Entry>(r => {
      const name = `${r.title}${r.year ? ` (${r.year})` : ''}`;
      const open = r.status === 'none' || r.status === 'partial';
      return {
        id: `seerr-${r.mediaType}-${r.id}`,
        group: 'Demandes',
        label: name,
        sub: `${r.mediaType === 'tv' ? 'Série' : 'Film'} · ${SEERR_SUB[r.status]}`,
        icon: { kind: 'poster', url: r.poster, fallback: r.mediaType === 'tv' ? RiTv2Line : RiMovie2Line },
        confirm: open ? `Entrée pour confirmer : demander « ${r.title} »${r.mediaType === 'tv' ? ' (toutes les saisons)' : ''}` : undefined,
        run: async () => {
          if (!open) {
            shell.notify(`${name} : ${SEERR_SUB[r.status].toLowerCase()}`, 'info');
            return;
          }
          try {
            await integrationsApi.seerrRequest(r.mediaType, r.id);
            shell.notify(`${r.mediaType === 'tv' ? '📺' : '🎬'} ${r.title} demandé`, 'ok');
          } catch (e) {
            shell.notify(e instanceof Error ? e.message : 'Demande impossible', 'err');
          }
        },
      };
    });
    const found = files.map<Entry>((f, i) => ({
      id: `nc-file-${i}-${f.url}`,
      group: 'Fichiers',
      label: f.title,
      sub: f.sub,
      icon: { kind: 'icon', icon: f.folder ? RiFolderLine : RiFileLine },
      run: () => window.open(f.url, '_blank', 'noopener'),
    }));
    const onWeb = web.map<Entry>((w, i) => {
      let host = '';
      try {
        host = new URL(w.url).hostname.replace(/^www\./, '');
      } catch {
        // Keep the title alone.
      }
      return {
        id: `web-${i}-${w.url}`,
        group: 'Web',
        label: w.title,
        sub: host + (w.content ? ` · ${w.content}` : ''),
        icon: { kind: 'icon', icon: RiGlobalLine },
        run: () => window.open(w.url, '_blank', 'noopener'),
      };
    });
    return [...local, ...found, ...requests, ...onWeb];
  }, [all, query, seerr, files, web, shell]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setConfirming(null);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    setConfirming(null);
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const run = (entry: Entry | undefined, newTab = false) => {
    if (!entry) return;
    if (entry.confirm && confirming !== entry.id) {
      setConfirming(entry.id);
      return;
    }
    onClose();
    void entry.run({ newTab });
  };

  if (!isOpen) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (entries.length ? (i + 1) % entries.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (entries.length ? (i - 1 + entries.length) % entries.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(entries[selectedIndex], e.ctrlKey || e.metaKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher"
        className="palette animate-dialog-in relative flex w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-secondary-default shadow-waitlist"
      >
        <div className="flex items-center gap-2 border-b border-separator-border px-4 py-3">
          <RiSearchLine className="palette-icon size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          {/* Shown by the Terminal style only: the palette becomes a prompt. */}
          <span className="palette-prompt hidden shrink-0" aria-hidden>
            nexus@portail:~$
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={entries[selectedIndex] ? `palette-${selectedIndex}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-headline-regular text-text-primary outline-none placeholder:text-text-placeholder"
            placeholder="Lien, catégorie ou action…"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
          />
          <Kbd>Échap</Kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {entries.length === 0 ? (
            <p className="px-2 py-8 text-center text-body-regular text-text-tertiary">{seerrBusy ? 'Recherche…' : 'Aucun résultat'}</p>
          ) : (
            entries.map((entry, index) => {
              const selected = index === selectedIndex;
              const isConfirming = confirming === entry.id;
              const newGroup = index === 0 || entries[index - 1].group !== entry.group;
              return (
                <React.Fragment key={entry.id}>
                  {newGroup && (
                    <p className="px-2 pt-2 pb-1 text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">
                      {entry.group}
                    </p>
                  )}
                  <div
                    id={`palette-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    onClick={e => run(entry, e.ctrlKey || e.metaKey)}
                    onMouseMove={() => selectedIndex !== index && setSelectedIndex(index)}
                    className={cx(
                      'flex cursor-pointer items-center justify-between gap-3 rounded-2lg px-2 py-1.5',
                      selected && 'bg-dropdown-item-hover-background',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background-tertiary-default/70 text-foreground-icon-primary">
                        {entry.icon.kind === 'service' ? (
                          <span className="relative">
                            <LinkIcon service={entry.icon.service} size={20} />
                            {entry.icon.service.status === 'offline' && (
                              <span className="absolute -right-1 -bottom-1 size-2 rounded-full bg-chart-3 ring-2 ring-background-secondary-default" />
                            )}
                          </span>
                        ) : entry.icon.kind === 'poster' ? (
                          entry.icon.url ? (
                            <img src={entry.icon.url} alt="" loading="lazy" className="h-8 w-[22px] rounded-sm object-cover" />
                          ) : (
                            <entry.icon.fallback className="size-[18px]" aria-hidden />
                          )
                        ) : entry.icon.kind === 'dot' ? (
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: entry.icon.color }} />
                        ) : (
                          <entry.icon.icon className={cx('size-[18px]', entry.danger && 'text-text-error-primary')} aria-hidden />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className={cx('truncate text-body-medium', isConfirming ? 'text-text-error-primary' : 'text-text-primary')}>
                          {isConfirming ? entry.confirm : entry.label}
                        </span>
                        {entry.sub && !isConfirming && (
                          <span className="truncate text-body-2-regular text-text-tertiary">{entry.sub}</span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {entry.icon.kind === 'service' && entry.icon.service.status === 'offline' && (
                        <span className="mr-1 rounded-md bg-status-rose-background px-1.5 text-caption-1-medium text-status-rose-text">
                          Hors ligne
                        </span>
                      )}
                      {entry.keys?.map(k => <Kbd key={k}>{k}</Kbd>)}
                      {selected && !entry.keys && (
                        <RiArrowRightLine className="size-4 text-foreground-icon-secondary" aria-hidden />
                      )}
                    </span>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-separator-border px-4 py-2 text-body-2-regular text-text-tertiary">
          <span className="tabular-nums">
            {entries.length} résultat{entries.length > 1 ? 's' : ''}
            {seerrBusy && ' · recherche…'}
          </span>
          <span className="flex items-center gap-3">
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>
                <RiCornerDownLeftLine className="size-3" aria-hidden />
              </Kbd>
              ouvrir
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>
                <RiCornerDownLeftLine className="size-3" aria-hidden />
              </Kbd>
              nouvel onglet
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};

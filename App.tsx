import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createHashRouter, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { RiMenuLine } from '@remixicon/react';
import { DashboardProvider, useDashboard } from './store';
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { System } from './pages/System';
import { HomeAssistant } from './pages/HomeAssistant';
import { Maison } from './pages/Maison';
import { Fichiers } from './pages/Fichiers';
import { Sidebar } from './components/layout/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { QuickAddLink } from './components/QuickAddLink';
import { ServiceDrawer } from './components/ServiceDrawer';
import { Kbd } from './components/ui/badge';
import { Island, type IslandEvent } from './components/Island';
import { PaperScraps } from './components/Doodle';
import { SkinDecor } from './components/SkinDecor';
import { Gravity } from './components/Gravity';
import { EasterEggs } from './components/EasterEggs';
import { FancyCursor } from './components/FancyCursor';
import { probeLite } from './lib/lite';
import { Wrapped, openWrapped } from './components/Wrapped';
import { Studio } from './components/Studio';
import { applyTheme } from './theme/theme';
import { folderTint } from './theme/folders';
import { ShellContext, VIEWS, dayPart, dismissNight, nightDismissed, nightFocusEnabled, readView, saveView, sectionId, type ShellApi, type ViewMode } from './lib/shell';
import { categoryKeys, containerOf as containerOfService, isTyping, openService, withViewTransition } from './lib/actions';
import { morph, morphBack } from './lib/motion';
import { treeOrder } from './lib/links';
import type { Service } from './types';
import { cx } from './utils/cx';

/**
 * App shell, the Jellydash layout (components/dashboard/dashboard-shell): the
 * page ground with a floating sidebar on the left and the scrolling content
 * beside it; below `lg` the sidebar becomes a drawer.
 *
 * It owns the dialogs every page can open (palette, quick add, service
 * details, the Dynamic Island) and the keyboard:
 *   Ctrl K or /   search / command palette
 *   1 … 9         open favourite n
 *   g + letter    jump to a category (g i → Infrastructure)
 *   n             add a link
 *   ?             list the shortcuts
 *   Ctrl ,        toggle the admin
 */


const Shell: React.FC = () => {
  const { data, isLoading, logAccess } = useDashboard();
  const { theme } = data;
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ url?: string; folderId?: string; name?: string; container?: string } | null>(null);
  const [details, setDetails] = useState<Service | null>(null);
  const [island, setIsland] = useState<IslandEvent[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<Service | null>(null);
  const [view, setViewState] = useState<ViewMode>(readView);
  const setView = useCallback((next: ViewMode) => {
    saveView(next);
    withViewTransition(() => setViewState(next));
  }, []);
  const [part, setPart] = useState(dayPart);
  const [nightOff, setNightOff] = useState(nightDismissed);
  useEffect(() => {
    const t = setInterval(() => {
      setPart(dayPart());
      setNightOff(nightDismissed());
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  const nightFocus = part === 'night' && nightFocusEnabled() && !nightOff;
  const setNightFocus = useCallback((value: boolean) => {
    if (!value) dismissNight();
    setNightOff(!value);
  }, []);
  const [studioActive, setStudioActive] = useState(false);
  const [gPending, setGPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const loaded = useRef(false);
  const gTimer = useRef<number | undefined>(undefined);

  // Apply mode + accent once the stored theme has loaded (before that, the
  // pre-paint script in index.html has already applied the cached one).
  useEffect(() => {
    if (isLoading && !loaded.current) return;
    loaded.current = true;
    applyTheme(theme);
    if (theme.mode !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(theme);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme.mode, theme.primaryColor, theme.skin, isLoading]);

  const notify = useCallback<ShellApi['notify']>((message, tone = 'ok', extra) => {
    const id = Date.now() + Math.random();
    // Same message already waiting: don't queue it twice. Keep the queue short.
    setIsland(prev => (prev.some(e => e.message === message) ? prev : [...prev, { id, message, tone, ...extra }].slice(-4)));
  }, []);
  // Weak device: lite mode switches itself on once (Admin → Mode léger).
  useEffect(() => probeLite(() => notify('Mode léger activé : cet appareil peinait à suivre les effets (réglable dans Admin)', 'info')), [notify]);

  // A jump marks its target active at once and holds off the scroll spy
  // while the smooth scroll runs (the last sections may never reach the top).
  const spyPausedUntil = useRef(0);
  const reportActiveCategory = useCallback((id: string | null) => {
    if (Date.now() < spyPausedUntil.current) return;
    setActiveCategory(id);
  }, []);

  const goToCategory = useCallback(
    (id: string) => {
      spyPausedUntil.current = Date.now() + 1200;
      setActiveCategory(id);
      if (location.pathname !== '/') {
        navigate('/', { state: { section: id }, viewTransition: true });
        return;
      }
      document.getElementById(sectionId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [location.pathname, navigate],
  );

  const shell = useMemo<ShellApi>(
    () => ({
      openPalette: () => setPaletteOpen(true),
      openHelp: () => setHelpOpen(true),
      // "Ajouter" morphs into the dialog, a tile into its details panel.
      openQuickAdd: opts => withViewTransition(() => setQuickAdd(opts ?? {})),
      quickAddOpen: quickAdd !== null,
      openDetails: service =>
        morph('service-detail', document.querySelector<HTMLElement>(`[data-tile="${service.id}"]`), () => setDetails(service)),
      notify,
      goToCategory,
      activeCategory,
      setActiveCategory: reportActiveCategory,
      issuesOnly,
      setIssuesOnly,
      justAdded,
      hoveredLink,
      setHoveredLink,
      nightFocus,
      setNightFocus,
      view,
      setView,
    }),
    [notify, goToCategory, reportActiveCategory, activeCategory, issuesOnly, justAdded, hoveredLink, nightFocus, setNightFocus, quickAdd, view, setView],
  );

  useEffect(() => {
    if (!justAdded) return;
    const t = window.setTimeout(() => setJustAdded(null), 2400);
    return () => window.clearTimeout(t);
  }, [justAdded]);

  // The island reports what happens on its own: outages (after two failed
  // checks in a row), recoveries, and new Jellyfin playbacks.
  const outage = useRef(new Map<string, 'up' | 'down'>());
  useEffect(() => {
    for (const [id, h] of Object.entries(data.health)) {
      const service = data.services.find(s => s.id === id);
      if (!service || !h.history.length) continue;
      const last = h.history[h.history.length - 1];
      const twoDown = h.history.length >= 2 && !last.up && !h.history[h.history.length - 2].up;
      const prev = outage.current.get(id);
      const now = twoDown ? 'down' : last.up ? 'up' : prev ?? 'up';
      if (prev && prev !== now) {
        if (now === 'down') notify(`${service.name} est hors ligne`, 'err', { service, onClick: () => shell.openDetails(service) });
        else notify(`${service.name} est de nouveau en ligne`, 'ok', { service });
      }
      outage.current.set(id, now);
    }
  }, [data.health]);

  // First three days of a month: the island offers last month's Wrapped, once.
  useEffect(() => {
    if (isLoading) return;
    const now = new Date();
    if (now.getDate() > 3) return;
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const key = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    try {
      if (window.localStorage.getItem('portail:wrapped-offered') === key) return;
      window.localStorage.setItem('portail:wrapped-offered', key);
    } catch {
      return;
    }
    const label = prev.toLocaleDateString('fr-FR', { month: 'long' });
    window.setTimeout(() => notify(`✨ Ton Wrapped de ${label} est prêt`, 'info', { onClick: () => openWrapped(key) }), 1500);
  }, [isLoading]);

  // Container updates: the island says when one ends.
  const jobEnds = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const jobs = Object.values(data.updates.jobs);
    const known = jobEnds.current;
    jobEnds.current = new Map(jobs.map(j => [j.container, j.endedAt ?? 0]));
    if (!known) return; // first load: old jobs aren't news
    for (const j of jobs) {
      if (!j.endedAt || known.get(j.container) === j.endedAt) continue;
      const service = data.services.find(s => containerOfService(s) === j.container);
      if (j.status === 'done') notify(`${j.container} est à jour`, 'ok', { service });
      else notify(`Mise à jour de ${j.container} échouée : ${j.error ?? 'erreur'}`, 'err', { service });
    }
  }, [data.updates.jobs]);

  const playing = useRef<Set<string> | null>(null);
  useEffect(() => {
    const items = Object.values(data.widgets)
      .filter(w => w.type === 'jellyfin' && w.ok)
      .flatMap(w => w.items);
    const known = playing.current;
    playing.current = new Set(items);
    if (!known) return; // first load: nothing is "new"
    const jellyfin = data.services.find(s => /jellyfin/i.test(s.name));
    for (const item of items) if (!known.has(item)) notify(`${item.replace(' · ', ' regarde ')}`, 'info', { service: jellyfin });
  }, [data.widgets]);

  const dialogOpen = paletteOpen || quickAdd !== null || details !== null || helpOpen;

  useEffect(() => {
    const keys = categoryKeys(data.categories);
    const favorites = treeOrder(data.services, data.categories).filter(s => s.isFavorite);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
        return;
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        navigate(location.pathname.startsWith('/admin') ? '/' : '/admin', { viewTransition: true });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (dialogOpen || document.querySelector('[role="menu"]')) return;

      // Second key of a `g` sequence.
      if (gPending) {
        window.clearTimeout(gTimer.current);
        setGPending(false);
        const letter = e.key.toLowerCase();
        const target = [...keys.entries()].find(([, k]) => k === letter)?.[0];
        if (target) {
          e.preventDefault();
          goToCategory(target);
        } else if (letter === 'a') {
          e.preventDefault();
          navigate('/admin', { viewTransition: true });
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === 'g') {
        e.preventDefault();
        setGPending(true);
        gTimer.current = window.setTimeout(() => setGPending(false), 1500);
      } else if (e.key === 'n') {
        e.preventDefault();
        withViewTransition(() => setQuickAdd({}));
      } else if (e.key === 'v') {
        // Next display style.
        e.preventDefault();
        const i = VIEWS.findIndex(v => v.key === view);
        const next = VIEWS[(i + 1) % VIEWS.length];
        setView(next.key);
        notify(`Affichage : ${next.label}`, 'ok');
      } else if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (/^[1-9]$/.test(e.key)) {
        const fav = favorites[Number(e.key) - 1];
        if (fav) {
          e.preventDefault();
          logAccess(fav.id);
          openService(fav);
        }
      } else if (e.key === 'Escape' && issuesOnly) {
        setIssuesOnly(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data.categories, data.services, location.pathname, navigate, goToCategory, dialogOpen, gPending, issuesOnly, view, setView, notify]);

  // New page, new scroll (a category jump scrolls on its own).
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setMobileOpen(false);
    if (!(location.state as { section?: string } | null)?.section) mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // A custom wallpaper (Admin → Thème) still applies behind the home page;
  // by default the ground is the soft accent glow with grain (.app-ground).
  const hasBackdrop = isHome && theme.backgroundType !== 'solid' && !!theme.backgroundValue;
  const keys = categoryKeys(data.categories);

  return (
    <ShellContext.Provider value={shell}>
      <div className="app-ground relative flex h-dvh w-full p-3" data-daypart={part} data-focus={nightFocus || undefined}>
        {theme.skin === 'paper' && isHome && <PaperScraps />}
        {(theme.skin !== 'blueprint' || isHome) && <SkinDecor skin={studioActive ? 'custom:draft' : theme.skin} services={data.services} userName={theme.userName} />}
        <div aria-hidden className="app-aurora">
          <span />
          <span />
          <span />
        </div>
        {hasBackdrop && (
          <div className="user-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
            {theme.backgroundType === 'image' ? (
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${theme.backgroundValue})` }} />
            ) : (
              <div className="absolute inset-0" style={{ background: theme.backgroundValue }} />
            )}
            <div className="user-backdrop-veil absolute inset-0 bg-background-full/85" />
          </div>
        )}

        <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <QuickAddLink
          open={quickAdd !== null}
          initialUrl={quickAdd?.url}
          initialName={quickAdd?.name}
          initialContainer={quickAdd?.container}
          initialFolderId={quickAdd?.folderId ?? (isHome ? activeCategory ?? undefined : undefined)}
          onClose={() => withViewTransition(() => setQuickAdd(null))}
          onCreated={(id, folderId) => {
            setJustAdded(id);
            if (location.pathname === '/') {
              window.setTimeout(() => goToCategory(folderId), 100);
            }
          }}
        />
        <ServiceDrawer
          service={details}
          onClose={() =>
            morphBack(
              'service-detail',
              details ? document.querySelector<HTMLElement>(`[data-tile="${details.id}"]`) : null,
              () => setDetails(null),
            )
          }
        />

        {/* Desktop sidebar */}
        <div className="relative z-10 hidden shrink-0 lg:flex">
          <Sidebar onOpenSearch={() => setPaletteOpen(true)} />
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="animate-rise-in relative z-10 h-full rounded-3xl border border-border-button-default bg-background-secondary-default p-1 shadow-sidebar">
              <Sidebar mobile onClose={() => setMobileOpen(false)} onOpenSearch={() => setPaletteOpen(true)} />
            </div>
          </div>
        )}

        <main ref={mainRef} className="relative z-10 flex min-w-0 flex-1 flex-col overflow-y-auto lg:pl-4">
          <div className="flex items-center gap-3 px-1 pt-1 pb-3 lg:hidden">
            <button
              type="button"
              aria-label="Ouvrir la navigation"
              onClick={() => setMobileOpen(true)}
              className="flex size-9 cursor-pointer items-center justify-center rounded-xl border border-border-button-default text-foreground-icon-secondary"
            >
              <RiMenuLine className="size-5" aria-hidden />
            </button>
            <span className="text-title-3-semibold text-text-primary">Nexus Portal</span>
          </div>
          <div className="flex-1 pb-8 lg:px-6 lg:pt-3">
            <Outlet />
          </div>
        </main>

        {/* `g` pressed: which letters lead where */}
        {gPending && (
          <div className="animate-dialog-in fixed bottom-6 left-1/2 z-[80] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border-button-default bg-background-secondary-default px-4 py-2.5 text-body-2-regular text-text-secondary shadow-dropdown">
            <Kbd>G</Kbd>
            {[...data.categories]
              .sort((a, b) => a.order - b.order)
              .filter(c => keys.has(c.id))
              .map(c => (
                <span key={c.id} className="flex items-center gap-1.5">
                  <Kbd>{keys.get(c.id)!.toUpperCase()}</Kbd>
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: folderTint(c.color) }} />
                  {c.name}
                </span>
              ))}
            {!keys.size || ![...keys.values()].includes('a') ? (
              <span className="flex items-center gap-1.5">
                <Kbd>A</Kbd> Administration
              </span>
            ) : null}
          </div>
        )}

        {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

        <Island queue={island} onDone={id => setIsland(prev => prev.filter(e => e.id !== id))} />
        <Gravity />
        <EasterEggs />
        <Wrapped />
        <Studio onActive={setStudioActive} />
        <FancyCursor />
      </div>
    </ShellContext.Provider>
  );
};

/** The `?` sheet, by theme. Keep it in step with the handlers above and in the components. */
const SHORTCUTS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'Partout',
    items: [
      [['Ctrl', 'K'], 'Rechercher, ouvrir, lancer une action'],
      [['/'], 'Rechercher'],
      [['1', '…', '9'], 'Ouvrir le favori n°'],
      [['G', 'lettre'], 'Aller à une catégorie (G I → Infrastructure)'],
      [['G', 'A'], 'Administration'],
      [['Ctrl', ','], 'Basculer vers l’admin'],
      [['Échap'], 'Fermer, ou quitter le filtre des pannes'],
      [['?'], 'Cette aide'],
    ],
  },
  {
    title: 'Liens',
    items: [
      [['N'], 'Ajouter un lien (ou collez une adresse)'],
      [['Ctrl', 'clic'], 'Ouvrir dans un nouvel onglet'],
      [['Clic droit'], 'Actions : copier, SSH, redémarrer, commenter, supprimer'],
      [['Maj', 'F10'], 'Les mêmes actions au clavier (ou la touche Menu)'],
      [['Maj', 'clic'], 'Sélectionner plusieurs liens'],
      [['F'], 'Retourner la tuile sélectionnée (QR code, adresse, notes)'],
      [['Survol'], 'Aperçu du site, ou état du service'],
    ],
  },
  {
    title: 'Palette et fenêtres',
    items: [
      [['↑', '↓'], 'Choisir'],
      [['Entrée'], 'Ouvrir ou lancer'],
      [['Ctrl', 'Entrée'], 'Ouvrir dans un nouvel onglet · enregistrer un commentaire'],
    ],
  },
  {
    title: 'Affichage',
    items: [
      [['V'], 'Changer de style : cartes, liste, icônes, bento, texte'],
      [['←', '→'], 'Wrapped : histoire précédente / suivante'],
      [['Espace'], 'Wrapped : pause'],
    ],
  },
  {
    title: 'Easter eggs · à taper n’importe où',
    items: [
      [['boum'], 'Gravité : les tuiles tombent, attrape-les'],
      [['disco'], 'Boule à facettes, les tuiles dansent'],
      [['matrix'], 'Pluie verte faite du nom de tes services'],
      [['snake'], 'Un Snake qui mange les tuiles (flèches ou ZQSD)'],
      [['404'], 'Le portail disparaît… pour de faux'],
      [['Échap'], 'Arrêter'],
    ],
  },
];

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === '?') && (e.preventDefault(), onClose());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh]">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Raccourcis clavier"
        className="animate-dialog-in relative flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-secondary-default shadow-waitlist"
      >
        <div className="flex items-baseline justify-between gap-4 px-5 pt-5 pb-3">
          <h2 className="text-headline-medium text-text-primary">Raccourcis clavier</h2>
          <span className="text-body-2-regular text-text-tertiary">
            <Kbd>Échap</Kbd> pour fermer
          </span>
        </div>
        <div className="grid gap-x-8 gap-y-5 overflow-y-auto px-5 pb-5 md:grid-cols-2">
          {SHORTCUTS.map(group => (
            <section key={group.title} className="flex flex-col gap-2">
              <h3 className="text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">{group.title}</h3>
              <dl className="flex flex-col gap-2">
                {group.items.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-body-2-regular">
                    <dt className="text-text-secondary">{label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      {keys.map(k => (
                        <Kbd key={k} className={cx(k.length > 2 && 'px-1.5')}>
                          {k}
                        </Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/admin', element: <Admin /> },
      { path: '/systeme', element: <System /> },
      { path: '/systeme/home-assistant', element: <HomeAssistant /> },
      { path: '/maison', element: <Maison /> },
      { path: '/fichiers', element: <Fichiers /> },
    ],
  },
]);

const App: React.FC = () => (
  <DashboardProvider>
    <RouterProvider router={router} />
  </DashboardProvider>
);

export default App;

import { useEffect, useRef, useState } from 'react';
import { RiAddLine, RiArrowDownSLine, RiFolderAddLine, RiLink, RiLoader4Line } from '@remixicon/react';
import { dockerApi } from '../api';
import { useDashboard } from '../store';
import { useShell } from '../lib/shell';
import { containerOf } from '../lib/actions';
import { nextFolderColor } from '../theme/folders';
import type { ContainerOverview } from '../types';
import { Button } from './ui/button';
import { Kbd } from './ui/badge';
import { LinkIcon } from './LinkIcon';
import { cx } from '../utils/cx';

/**
 * "+ Ajouter" as a create menu (bencho.dev "Create menu"): a link, a
 * category, or a running Docker container that has no tile yet. Picking a
 * container opens the quick add with its name, its address (published port
 * on the server) and the Docker binding already filled in.
 */

/** Databases, caches, the VPN gateway and the portal itself are not things you open. */
const NOT_AN_APP = /(^|[-_])(db|redis|postgres|postgresql|mariadb|mysql|mongo|valkey|vpn)([-_\d]|$)|^nexus-portal/i;

const pretty = (name: string) =>
  name
    .replace(/[-_]+/g, ' ')
    .replace(/\s*\d+$/, '')
    .replace(/\b\w/g, c => c.toUpperCase());

export function AddMenu() {
  const { data, addCategory } = useDashboard();
  const { openQuickAdd, quickAddOpen, goToCategory, notify } = useShell();
  const [open, setOpen] = useState(false);
  const [containers, setContainers] = useState<ContainerOverview[] | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFolderName(null);
    dockerApi.getOverview().then(setContainers).catch(() => setContainers([]));
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // A tile counts even when it isn't bound to Docker: same name or subdomain.
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const bound = new Set<string>(data.services.map(containerOf).filter((c): c is string => !!c));
  const known = new Set<string>();
  for (const s of data.services) {
    known.add(slug(s.name));
    try {
      known.add(slug(new URL(s.url).hostname.split('.')[0]));
    } catch {
      // skip
    }
  }
  const candidates = (containers ?? [])
    .filter(c => !bound.has(c.name) && !known.has(slug(c.name)) && !NOT_AN_APP.test(c.name))
    .sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || b.ports.length - a.ports.length || a.name.localeCompare(b.name));

  // The server's address: the SSH target, else a tile on a LAN IP, else this page's host.
  const serverHost = (() => {
    const ssh = data.theme.sshTarget?.split('@').pop()?.trim();
    if (ssh) return ssh;
    for (const s of data.services) {
      try {
        const h = new URL(s.url).hostname;
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) return h;
      } catch {
        // skip
      }
    }
    return window.location.hostname;
  })();

  const addContainer = (c: ContainerOverview) => {
    setOpen(false);
    const port = c.ports.find(p => ![22, 5432, 3306, 6379].includes(p));
    openQuickAdd({ name: pretty(c.name), container: c.name, url: port ? `http://${serverHost}:${port}` : '' });
  };

  const createFolder = async () => {
    const name = folderName?.trim();
    if (!name) return;
    setOpen(false);
    const id = await addCategory({
      id: '',
      name,
      color: nextFolderColor(data.categories.map(c => c.color)),
      icon: 'lucide:folder',
      order: data.categories.length,
    }).catch(() => null);
    if (id) {
      notify(`Catégorie « ${name} » créée`, 'ok');
      window.setTimeout(() => goToCategory(id), 60);
    }
  };

  const item = 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-body-regular text-text-primary outline-none hover:bg-dropdown-item-hover-background focus-visible:bg-dropdown-item-hover-background';

  return (
    <div ref={ref} className="relative">
      <Button
        size="small"
        leadingIcon={RiAddLine}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Ajouter un lien, une catégorie ou un conteneur (N pour un lien)"
        className="btn-shimmer"
        style={{ viewTransitionName: quickAddOpen ? 'none' : 'quick-add' }}
      >
        Ajouter
        <RiArrowDownSLine className={cx('-mr-1 size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </Button>

      {open && (
        <div
          role="menu"
          className="animate-dialog-in absolute top-full right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border border-border-button-default bg-background-secondary-default p-1.5 shadow-dropdown"
        >
          <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), openQuickAdd())}>
            <RiLink className="size-4 text-foreground-icon-secondary" aria-hidden />
            <span className="flex-1">Lien</span>
            <Kbd>N</Kbd>
          </button>

          {folderName === null ? (
            <button type="button" role="menuitem" className={item} onClick={() => setFolderName('')}>
              <RiFolderAddLine className="size-4 text-foreground-icon-secondary" aria-hidden />
              <span className="flex-1">Catégorie</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-1.5 py-1">
              <input
                autoFocus
                value={folderName}
                onChange={e => setFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') createFolder();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setFolderName(null);
                  }
                }}
                placeholder="Nom de la catégorie"
                aria-label="Nom de la nouvelle catégorie"
                className="h-8 min-w-0 flex-1 rounded-lg bg-background-tertiary-default px-2 text-body-regular text-text-primary outline-none placeholder:text-text-placeholder focus:ring-2 focus:ring-border-focus-ring"
              />
              <Button size="small" onClick={createFolder} disabled={!folderName.trim()}>
                Créer
              </Button>
            </div>
          )}

          <p className="mt-1.5 flex items-center justify-between border-t border-separator-border px-2.5 pt-2.5 pb-1 text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">
            Conteneurs sans tuile
            {containers && <span className="tracking-normal tabular-nums normal-case">{candidates.length}</span>}
          </p>
          <div className="max-h-72 overflow-y-auto">
            {!containers ? (
              <p className="flex items-center gap-2 px-2.5 py-2 text-body-2-regular text-text-tertiary">
                <RiLoader4Line className="size-4 animate-spin" aria-hidden /> Lecture de Docker…
              </p>
            ) : candidates.length === 0 ? (
              <p className="px-2.5 py-2 text-body-2-regular text-text-tertiary">Tous les conteneurs ont déjà leur tuile.</p>
            ) : (
              candidates.map(c => (
                <button key={c.name} type="button" role="menuitem" className={item} onClick={() => addContainer(c)} title={c.image}>
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background-tertiary-default/70">
                    <LinkIcon service={{ name: c.name, icon: 'lucide:box' }} size={18} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-medium">{pretty(c.name)}</span>
                    <span className="truncate text-caption-1-regular text-text-tertiary">
                      {c.ports.length ? `:${c.ports.slice(0, 3).join(', :')}` : 'pas de port publié'} · {c.image.split('/').pop()}
                    </span>
                  </span>
                  <span className={cx('size-1.5 shrink-0 rounded-full', c.state === 'running' ? 'bg-chart-7' : 'bg-text-tertiary/60')} aria-hidden />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

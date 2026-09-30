import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RiArrowDownLine,
  RiArrowRightSLine,
  RiArrowRightUpLine,
  RiArrowUpLine,
  RiCloseLine,
  RiCornerLeftUpLine,
  RiFileCodeLine,
  RiFileExcelLine,
  RiFileLine,
  RiFilePdf2Line,
  RiFilePpt2Line,
  RiFileTextLine,
  RiFileWordLine,
  RiFileZipLine,
  RiFilmLine,
  RiFolder3Fill,
  RiFolderAddLine,
  RiFolderOpenLine,
  RiImageLine,
  RiLoader4Line,
  RiMusic2Line,
  RiSearchLine,
  RiUploadCloud2Line,
} from '@remixicon/react';
import { integrationsApi } from '../api';
import { useShell } from '../lib/shell';
import { READ_ONLY_HINT, STORES, canWrite, fileSize, hasFiles, useUploader, type Store } from '../lib/storage';
import type { TreeItem } from '../types';
import { PageHeader, Panel } from '../components/ui/panel';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/form';
import { cx } from '../utils/cx';

/**
 * Fichiers: Nextcloud and kDrive in full page. A breadcrumb to move up, the
 * current folder as a sortable list (folders first), a search over the whole
 * store whose results can jump to their folder, a new folder, and files sent
 * with the button or dropped anywhere on the page (100 MB each at most).
 * Files open in their web app, in a new tab. The sidebar's Stockage tree is
 * the compact version (components/CloudTree.tsx).
 */

type Crumb = { open: string; name: string };
type Sort = 'name' | 'modified' | 'size';

const STORE_KEY = 'portail:files-store';

function iconFor(it: TreeItem) {
  if (it.folder) return RiFolder3Fill;
  const ext = it.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg', 'bmp', 'tif', 'tiff'].includes(ext)) return RiImageLine;
  if (ext === 'pdf') return RiFilePdf2Line;
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return RiFileWordLine;
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) return RiFileExcelLine;
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return RiFilePpt2Line;
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return RiFilmLine;
  if (['mp3', 'flac', 'wav', 'm4a', 'ogg'].includes(ext)) return RiMusic2Line;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return RiFileZipLine;
  if (['js', 'ts', 'tsx', 'py', 'json', 'html', 'css', 'sh', 'yml', 'yaml', 'xml'].includes(ext)) return RiFileCodeLine;
  if (['txt', 'md', 'log'].includes(ext)) return RiFileTextLine;
  return RiFileLine;
}

function when(ms: number | null) {
  if (!ms) return '';
  const d = new Date(ms);
  const days = (Date.now() - ms) / 86_400_000;
  if (days < 1 && d.getDate() === new Date().getDate()) return `aujourd’hui ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Nextcloud paths give the whole breadcrumb. */
const crumbsOfPath = (path: string): Crumb[] => {
  const parts = path.split('/').filter(Boolean);
  return [{ open: '/', name: STORES.nextcloud.name }, ...parts.map((p, i) => ({ open: '/' + parts.slice(0, i + 1).join('/'), name: p }))];
};

export const Fichiers: React.FC = () => {
  const { notify } = useShell();
  const [stores, setStores] = useState<Store[] | null>(null);
  const [store, setStore] = useState<Store>(() => {
    try {
      return (window.localStorage.getItem(STORE_KEY) as Store) || 'nextcloud';
    } catch {
      return 'nextcloud';
    }
  });
  const [crumbs, setCrumbs] = useState<Record<Store, Crumb[]>>({
    nextcloud: [{ open: '/', name: STORES.nextcloud.name }],
    kdrive: [{ open: '1', name: STORES.kdrive.name }],
  });
  const [items, setItems] = useState<TreeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ by: Sort; asc: boolean }>({ by: 'name', asc: true });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TreeItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    integrationsApi
      .getAll()
      .then(list => {
        const ok = (['nextcloud', 'kdrive'] as Store[]).filter(t => {
          const c = list.find(i => i.type === t);
          return c?.enabled && (t === 'nextcloud' ? c.hasPassword && !!c.username : c.hasApiKey);
        });
        setStores(ok);
        setStore(s => (ok.includes(s) ? s : ok[0] ?? s));
      })
      .catch(() => setStores([]));
  }, []);

  const trail = crumbs[store];
  const here = trail[trail.length - 1];

  const load = useCallback(() => {
    setItems(null);
    setError(null);
    integrationsApi
      .storageTree(store, here.open)
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Lecture impossible'));
  }, [store, here.open]);

  useEffect(() => {
    if (stores?.includes(store)) load();
  }, [stores, store, load]);

  const { sending, upload } = useUploader(store, here.open, here.name, load);

  // Search the whole store, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = window.setTimeout(() => {
      integrationsApi
        .storageFind(store, q, ctrl.signal)
        .then(setResults)
        .catch(e => !ctrl.signal.aborted && notify(e instanceof Error ? e.message : 'Recherche impossible', 'err'))
        .finally(() => !ctrl.signal.aborted && setSearching(false));
    }, 400);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query, store]);

  const go = (next: Crumb[]) => {
    setCrumbs(c => ({ ...c, [store]: next }));
    setQuery('');
    setCreating(false);
  };

  const enter = (it: TreeItem) => {
    if (!it.open) return;
    go(store === 'nextcloud' ? crumbsOfPath(it.open) : [...trail, { open: it.open, name: it.name }]);
  };

  // From a search result to the folder holding it.
  const reveal = (it: TreeItem) => {
    if (!it.parent) return;
    if (store === 'nextcloud') go(crumbsOfPath(it.parent));
    else {
      const parentName = it.path.split('/').slice(-2, -1)[0] || 'Dossier';
      go(it.parent === STORES.kdrive.root ? [trail[0]] : [trail[0], { open: it.parent, name: parentName }]);
    }
  };

  const pickStore = (s: Store) => {
    setStore(s);
    setQuery('');
    try {
      window.localStorage.setItem(STORE_KEY, s);
    } catch {
      // This visit only.
    }
  };

  const submitFolder = async () => {
    const clean = newName.trim();
    setCreating(false);
    setNewName('');
    if (!clean) return;
    try {
      await integrationsApi.createFolder(store, here.open, clean);
      notify(`Dossier « ${clean} » créé dans « ${here.name} »`, 'ok');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Création impossible', 'err');
    }
  };

  const sorted = useMemo(() => {
    const list = [...(results ?? items ?? [])];
    const dir = sort.asc ? 1 : -1;
    const key = (it: TreeItem) => (sort.by === 'size' ? it.size ?? -1 : sort.by === 'modified' ? it.modified ?? 0 : 0);
    return list.sort(
      (a, b) =>
        Number(b.folder) - Number(a.folder) ||
        (sort.by === 'name' ? a.name.localeCompare(b.name, 'fr', { numeric: true }) : key(a) - key(b)) * dir ||
        a.name.localeCompare(b.name, 'fr', { numeric: true }),
    );
  }, [items, results, sort]);

  const header = (by: Sort, label: string, className?: string) => (
    <th className={className}>
      <button
        type="button"
        onClick={() => setSort(s => ({ by, asc: s.by === by ? !s.asc : by === 'name' }))}
        className="flex cursor-pointer items-center gap-1 hover:text-text-primary"
      >
        {label}
        {sort.by === by && (sort.asc ? <RiArrowUpLine className="size-3.5" aria-hidden /> : <RiArrowDownLine className="size-3.5" aria-hidden />)}
      </button>
    </th>
  );

  if (stores && !stores.length) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Fichiers" subtitle="Nextcloud et kDrive" />
        <Panel title="Aucun stockage configuré" subtitle="Ajoute le mot de passe d’application Nextcloud ou le jeton kDrive dans Admin → Intégrations.">
          <a href="#/admin" className="text-body-regular text-text-link underline underline-offset-2">
            Aller aux intégrations
          </a>
        </Panel>
      </div>
    );
  }

  const searchMode = query.trim().length >= 2;
  const writable = canWrite(store, here.open);
  const count = sorted.length;

  return (
    <div
      className="relative flex flex-col gap-6"
      onDragEnter={e => {
        if (!hasFiles(e) || !writable) return;
        dragDepth.current++;
        setOver(true);
      }}
      onDragOver={e => {
        if (!hasFiles(e) || !writable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={e => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setOver(false);
      }}
      onDrop={e => {
        if (!hasFiles(e) || !writable) return;
        e.preventDefault();
        dragDepth.current = 0;
        setOver(false);
        void upload(Array.from(e.dataTransfer.files));
      }}
    >
      <PageHeader
        title="Fichiers"
        subtitle={searchMode ? `Recherche dans tout ${STORES[store].name}` : `${STORES[store].name} · ${items ? `${items.length} élément${items.length > 1 ? 's' : ''}` : 'chargement…'}`}
        actions={
          stores && stores.length > 1 ? (
            <SegmentedControl<Store> label="Stockage" value={store} onChange={pickStore} options={stores.map(s => ({ key: s, label: STORES[s].name }))} />
          ) : undefined
        }
      />

      <Panel>
        <div className="flex flex-col gap-4">
          {/* Breadcrumb and actions */}
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Emplacement" className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-0.5 text-body-regular sm:basis-0">
              {trail.length > 1 && (
                <button type="button" onClick={() => go(trail.slice(0, -1))} title="Dossier parent" aria-label="Dossier parent" className="mr-1 grid size-7 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary hover:bg-background-tertiary-default">
                  <RiCornerLeftUpLine className="size-4" aria-hidden />
                </button>
              )}
              {trail.map((c, i) => (
                <React.Fragment key={`${c.open}-${i}`}>
                  {i > 0 && <RiArrowRightSLine className="size-4 shrink-0 text-foreground-icon-tertiary" aria-hidden />}
                  <button
                    type="button"
                    onClick={() => go(trail.slice(0, i + 1))}
                    disabled={i === trail.length - 1 && !searchMode}
                    aria-current={i === trail.length - 1 ? 'location' : undefined}
                    className={cx(
                      'max-w-[14rem] truncate rounded-lg px-1.5 py-0.5',
                      i === trail.length - 1 ? 'text-body-semibold text-text-primary' : 'cursor-pointer text-text-tertiary hover:bg-background-tertiary-default hover:text-text-primary',
                    )}
                  >
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="small" leadingIcon={RiFolderAddLine} onClick={() => setCreating(true)} disabled={!writable} title={writable ? undefined : READ_ONLY_HINT}>
                Nouveau dossier
              </Button>
              <Button size="small" leadingIcon={RiUploadCloud2Line} onClick={() => picker.current?.click()} disabled={!writable} title={writable ? undefined : READ_ONLY_HINT}>
                Déposer
              </Button>
              <input
                ref={picker}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const files: File[] = e.target.files ? Array.from(e.target.files) : [];
                  e.target.value = '';
                  void upload(files);
                }}
              />
            </div>
          </div>

          {!writable && !searchMode && <p className="-mt-2 text-body-2-regular text-text-tertiary">{READ_ONLY_HINT}</p>}

          <Input
            leadingIcon={RiSearchLine}
            placeholder={`Rechercher dans tout ${STORES[store].name} (nom de fichier ou de dossier)`}
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Rechercher un fichier"
            trailing={
              query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="grid size-6 cursor-pointer place-items-center rounded-md text-foreground-icon-tertiary hover:text-foreground-icon-primary">
                  <RiCloseLine className="size-4" aria-hidden />
                </button>
              ) : searching ? (
                <RiLoader4Line className="size-4 animate-spin text-foreground-icon-tertiary" aria-hidden />
              ) : undefined
            }
          />

          {/* New folder, uploads in progress */}
          {creating && (
            <div className="flex items-center gap-2">
              <RiFolderAddLine className="size-5 shrink-0 text-accent-400" aria-hidden />
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void submitFolder();
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewName('');
                  }
                }}
                onBlur={() => void submitFolder()}
                placeholder={`Nom du nouveau dossier dans « ${here.name} »`}
                aria-label="Nom du nouveau dossier"
                className="h-9 min-w-0 flex-1 rounded-lg bg-background-tertiary-default px-3 text-body-regular text-text-primary outline-none placeholder:text-text-placeholder focus:ring-2 focus:ring-border-focus-ring"
              />
            </div>
          )}
          {sending.length > 0 && (
            <ul className="flex flex-col gap-2">
              {sending.map((f, i) => (
                <li key={`up-${i}`} className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-body-2-regular text-text-secondary">
                    <RiUploadCloud2Line className="size-4 shrink-0 text-accent-400" aria-hidden />
                    <span className="min-w-0 truncate">{f.name}</span>
                    <span className="ml-auto shrink-0 text-text-tertiary tabular-nums">{Math.round(f.pct * 100)} %</span>
                  </span>
                  <span className="block h-1 rounded-full bg-chart-track">
                    <span className="block h-full rounded-full bg-accent-400 transition-[width] duration-200" style={{ width: `${Math.max(2, f.pct * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* The list */}
          {error ? (
            <p className="text-body-regular text-text-error-primary">{error}</p>
          ) : (searchMode ? results === null : items === null) ? (
            <p className="flex items-center gap-2 py-6 text-body-regular text-text-tertiary">
              <RiLoader4Line className="size-4 animate-spin" aria-hidden /> {searchMode ? 'Recherche…' : 'Chargement…'}
            </p>
          ) : !count ? (
            <p className="py-6 text-center text-body-regular text-text-tertiary">
              {searchMode ? 'Aucun fichier ne porte ce nom.' : 'Dossier vide : dépose des fichiers ici ou crée un dossier.'}
            </p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="bui-table w-full">
                <thead>
                  <tr>
                    {header('name', 'Nom')}
                    {header('modified', 'Modifié', 'hidden w-48 sm:table-cell')}
                    {header('size', 'Taille', 'hidden w-28 md:table-cell')}
                    <th className="w-24" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(it => {
                    const Icon = iconFor(it);
                    return (
                      <tr key={`${it.open ?? ''}${it.url}`} className="group/row">
                        <td>
                          {it.folder ? (
                            <button type="button" onClick={() => enter(it)} className="flex w-full min-w-0 cursor-pointer items-center gap-3 text-left">
                              <Icon className="size-5 shrink-0 text-accent-400" aria-hidden />
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-body-medium text-text-primary">{it.name}</span>
                                {searchMode && <span className="truncate text-caption-1-regular text-text-tertiary">{it.parent}</span>}
                              </span>
                            </button>
                          ) : (
                            <a href={it.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-3">
                              <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-body-regular text-text-primary group-hover/row:underline">{it.name}</span>
                                {searchMode && <span className="truncate text-caption-1-regular text-text-tertiary">{store === 'nextcloud' ? it.parent : it.path}</span>}
                              </span>
                            </a>
                          )}
                        </td>
                        <td className="hidden text-body-2-regular text-text-tertiary sm:table-cell">{when(it.modified)}</td>
                        <td className="hidden text-body-2-regular text-text-tertiary tabular-nums md:table-cell">{it.size !== null ? fileSize(it.size) : ''}</td>
                        <td>
                          <span className="flex justify-end gap-1">
                            {searchMode && it.parent && (
                              <button type="button" onClick={() => reveal(it)} title="Aller au dossier qui le contient" aria-label={`Aller au dossier de ${it.name}`} className="grid size-8 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary hover:bg-background-tertiary-default">
                                <RiFolderOpenLine className="size-4" aria-hidden />
                              </button>
                            )}
                            <a href={it.url} target="_blank" rel="noopener noreferrer" title={`Ouvrir dans ${STORES[store].name}`} aria-label={`Ouvrir ${it.name} dans ${STORES[store].name}`} className="grid size-8 place-items-center rounded-lg text-foreground-icon-secondary hover:bg-background-tertiary-default">
                              <RiArrowRightUpLine className="size-4" aria-hidden />
                            </a>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>

      {over && (
        <div className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-3xl border-2 border-dashed border-accent-400 bg-background-full/80">
          <span className="flex items-center gap-2 text-headline-medium text-text-primary">
            <RiUploadCloud2Line className="size-6" aria-hidden /> Déposer dans « {here.name} »
          </span>
        </div>
      )}
    </div>
  );
};

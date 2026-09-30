import React, { useEffect, useRef, useState } from 'react';
import {
  RiArrowRightSLine,
  RiArrowRightUpLine,
  RiFileLine,
  RiFolder3Line,
  RiFolderAddLine,
  RiFolderOpenLine,
  RiLoader4Line,
  RiUploadCloud2Line,
} from '@remixicon/react';
import { integrationsApi } from '../api';
import { useShell } from '../lib/shell';
import { READ_ONLY_HINT, STORES, canWrite, fileSize, hasFiles, useUploader, type Store } from '../lib/storage';
import type { TreeItem } from '../types';
import { cx } from '../utils/cx';

/**
 * Sidebar → Stockage: the folders and files of Nextcloud and kDrive, once
 * their integration can read them (Admin → Intégrations). A folder loads its
 * content when opened, one level at a time; a file opens in its web app in a
 * new tab. The Nextcloud / kDrive rows look like the link folders above.
 * Each folder takes files dropped on it; its icons (on hover, always on touch
 * screens) send files, create a sub-folder and open it on the web. The big
 * version is the Fichiers page (pages/Fichiers.tsx).
 */

export function CloudTree() {
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    integrationsApi
      .getAll()
      .then(list =>
        setStores(
          (['nextcloud', 'kdrive'] as Store[]).filter(t => {
            const c = list.find(i => i.type === t);
            return c?.enabled && (t === 'nextcloud' ? c.hasPassword && !!c.username : c.hasApiKey);
          }),
        ),
      )
      .catch(() => undefined);
  }, []);

  if (!stores.length) return null;
  return (
    <div className="pt-4">
      <p className="flex items-center justify-between pr-1 pb-1 pl-5 text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">
        Stockage
        <a href="#/fichiers" className="text-caption-1-regular tracking-normal normal-case hover:text-text-primary">
          Tout voir
        </a>
      </p>
      <ul>
        {stores.map(s => (
          <li key={s}>
            <Folder store={s} name={STORES[s].name} open={STORES[s].root} depth={0} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Folder({ store, name, open, depth, url }: { store: Store; name: string; open: string; depth: number; url?: string }) {
  const { notify } = useShell();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<TreeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const load = () => {
    setError(null);
    integrationsApi
      .storageTree(store, open)
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Lecture impossible'));
  };
  const { sending, upload } = useUploader(store, open, name, load);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !items) load();
  };

  const send = (files: File[]) => {
    setExpanded(true);
    void upload(files);
  };

  const startFolder = () => {
    setExpanded(true);
    if (!items) load();
    setCreating(true);
  };

  const submitFolder = async () => {
    const clean = newName.trim();
    setCreating(false);
    setNewName('');
    if (!clean) return;
    try {
      await integrationsApi.createFolder(store, open, clean);
      notify(`Dossier « ${clean} » créé dans « ${name} »`, 'ok');
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Création impossible', 'err');
    }
  };

  const root = depth === 0;
  const tool =
    'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-foreground-icon-tertiary outline-none hover:bg-background-secondary-hover hover:text-foreground-icon-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring';
  return (
    <>
      <div
        className={cx('group/folder relative flex items-center rounded-lg transition-colors', over && 'bg-background-secondary-hover ring-2 ring-accent-400')}
        onDragOver={e => {
          if (!hasFiles(e) || !canWrite(store, open)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          if (!hasFiles(e) || !canWrite(store, open)) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          send(Array.from(e.dataTransfer.files));
        }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          title={name}
          className={cx(
            'flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
            root ? 'pl-5 text-body-medium' : 'pl-1 text-body-regular',
            expanded ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
          )}
        >
          <RiArrowRightSLine className={cx('size-4 shrink-0 transition-transform duration-200', expanded && 'rotate-90')} aria-hidden />
          {!root && (expanded ? <RiFolderOpenLine className="size-4 shrink-0" aria-hidden /> : <RiFolder3Line className="size-4 shrink-0" aria-hidden />)}
          <span className="min-w-0 truncate">{name}</span>
        </button>
        {/* Over the row's right end, on hover or keyboard focus: the name keeps its room.
            Touch screens have no hover: there the icons stay, in line, on every folder. */}
        <span className="absolute top-1/2 right-0 hidden -translate-y-1/2 items-center rounded-lg bg-background-full/95 group-focus-within/folder:flex group-hover/folder:flex [@media(hover:none)]:static [@media(hover:none)]:flex [@media(hover:none)]:translate-y-0 [@media(hover:none)]:bg-transparent">
          {canWrite(store, open) && (
            <>
              <button type="button" onClick={() => picker.current?.click()} title={`Déposer des fichiers dans « ${name} »`} aria-label={`Déposer des fichiers dans « ${name} »`} className={tool}>
                <RiUploadCloud2Line className="size-3.5" aria-hidden />
              </button>
              <button type="button" onClick={startFolder} title={`Nouveau dossier dans « ${name} »`} aria-label={`Nouveau dossier dans « ${name} »`} className={tool}>
                <RiFolderAddLine className="size-3.5" aria-hidden />
              </button>
            </>
          )}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" title={`Ouvrir « ${name} » dans ${STORES[store].name}`} aria-label={`Ouvrir « ${name} » dans ${STORES[store].name}`} className={tool}>
              <RiArrowRightUpLine className="size-3.5" aria-hidden />
            </a>
          )}
        </span>
        <input
          ref={picker}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            const files: File[] = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = '';
            send(files);
          }}
        />
      </div>
      {expanded && (
        <ul className={cx('border-l border-separator-border', root ? 'ml-7' : 'ml-3')}>
          {creating && (
            <li className="flex items-center gap-1.5 py-1 pr-1 pl-2">
              <RiFolderAddLine className="size-3.5 shrink-0 text-accent-400" aria-hidden />
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
                placeholder="Nom du dossier"
                aria-label="Nom du nouveau dossier"
                className="h-7 min-w-0 flex-1 rounded-md bg-background-tertiary-default px-2 text-body-2-regular text-text-primary outline-none placeholder:text-text-placeholder focus:ring-2 focus:ring-border-focus-ring"
              />
            </li>
          )}
          {sending.map((f, i) => (
            <li key={`up-${i}`} className="flex flex-col gap-1 py-1 pr-1 pl-6" title={f.name}>
              <span className="flex items-center gap-1.5 text-body-2-regular text-text-secondary">
                <RiUploadCloud2Line className="size-3.5 shrink-0 text-accent-400" aria-hidden />
                <span className="min-w-0 truncate">{f.name}</span>
                <span className="ml-auto shrink-0 text-caption-1-regular text-text-tertiary tabular-nums">{Math.round(f.pct * 100)} %</span>
              </span>
              <span className="block h-[3px] rounded-full bg-chart-track">
                <span className="block h-full rounded-full bg-accent-400 transition-[width] duration-200" style={{ width: `${Math.max(2, f.pct * 100)}%` }} />
              </span>
            </li>
          ))}
          {!items && !error && (
            <li className="flex h-7 items-center gap-2 pl-2 text-body-2-regular text-text-tertiary">
              <RiLoader4Line className="size-3.5 animate-spin" aria-hidden /> Chargement…
            </li>
          )}
          {error && <li className="py-1 pl-2 text-body-2-regular text-text-error-primary">{error}</li>}
          {items && !items.length && !creating && <li className="py-1 pl-2 text-body-2-regular text-text-tertiary">Dossier vide</li>}
          {items?.map(it => (
            <li key={`${it.open ?? ''}${it.url}`} className="pl-1">
              {it.folder && it.open ? (
                <Folder store={store} name={it.name} open={it.open} depth={depth + 1} url={it.url} />
              ) : (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${it.name}${it.size !== null ? ` · ${fileSize(it.size)}` : ''}`}
                  className="flex h-7 items-center gap-1.5 rounded-lg pr-1 pl-6 text-body-2-regular text-text-secondary outline-none hover:bg-background-secondary-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <RiFileLine className="size-3.5 shrink-0 text-foreground-icon-tertiary" aria-hidden />
                  <span className="min-w-0 truncate">{it.name}</span>
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

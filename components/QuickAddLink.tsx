import React, { useEffect, useRef, useState } from 'react';
import { RiAddLine, RiCornerDownLeftLine, RiLink, RiLoader4Line } from '@remixicon/react';
import { linksApi, type LinkPreview } from '../api';
import { useDashboard } from '../store';
import { byOrder, linksIn, looksLikeUrl, normalizeUrl } from '../lib/links';
import { folderColor, nextFolderColor } from '../theme/folders';
import { Button } from './ui/button';
import { Kbd } from './ui/badge';
import { cx } from '../utils/cx';
import { GITHUB_FOLDER } from '../lib/github';

/**
 * Quick add: paste an address, press Enter. The name, description and icon
 * come from the page itself (backend /api/links/preview); the folder defaults
 * to the one open in the tree. Everything stays editable, nothing is required
 * beyond the address.
 */
const MORPHS = typeof document !== 'undefined' && ('startViewTransition' in document && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function QuickAddLink({
  open,
  initialUrl = '',
  initialFolderId,
  initialName,
  initialContainer,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialUrl?: string;
  initialFolderId?: string;
  /** Prefilled name (e.g. from a Docker container). */
  initialName?: string;
  /** Bind the new tile to this container (status, CPU/RAM, restart). */
  initialContainer?: string;
  onClose: () => void;
  onCreated?: (id: string, folderId: string) => void;
}) {
  const { data, addService, addCategory } = useDashboard();
  const folders = [...data.categories].sort(byOrder);

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [folderId, setFolderId] = useState<string>('');
  /** The folder was picked by hand (or given by the caller): leave it alone. */
  const [folderChosen, setFolderChosen] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconFailed, setIconFailed] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setName(initialName ?? '');
    setNameEdited(!!initialName);
    setPreview(null);
    setError(null);
    setNewFolder(null);
    setFolderChosen(!!initialFolderId);
    setFolderId(initialFolderId && folders.some(f => f.id === initialFolderId) ? initialFolderId : folders[0]?.id ?? '');
    requestAnimationFrame(() => {
      urlRef.current?.focus();
      urlRef.current?.select();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Read the page behind the address as soon as it looks like one.
  useEffect(() => {
    if (!open) return;
    if (!looksLikeUrl(url)) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const p = await linksApi.preview(normalizeUrl(url), controller.signal);
        setPreview(p);
        setIconFailed(false);
        if (!nameEdited) setName(p.title);
        // GitHub repositories gather in their own folder (created on save).
        if (p.github && !folderChosen) {
          const gh = folders.find(f => f.name.trim().toLowerCase() === GITHUB_FOLDER.toLowerCase());
          if (gh) {
            setFolderId(gh.id);
            setNewFolder(null);
          } else setNewFolder(GITHUB_FOLDER);
        }
      } catch {
        if (!controller.signal.aborted) setPreview(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const valid = looksLikeUrl(url);
  const host = valid ? new URL(normalizeUrl(url)).hostname.replace(/^www\./, '') : '';
  const finalName = name.trim() || preview?.title || host;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      let target = folderId;
      if (newFolder !== null) {
        const label = newFolder.trim() || 'Nouveau dossier';
        target = await addCategory({
          id: crypto.randomUUID?.() ?? String(Date.now()),
          name: label,
          color: nextFolderColor(data.categories.map(c => c.color)),
          icon: 'lucide:folder',
          order: folders.length,
        });
      }
      const siblings = linksIn(data.services, target);
      const id = await addService({
        id: '',
        name: finalName,
        description: preview?.description ? preview.description.slice(0, 140) : '',
        url: normalizeUrl(url),
        categoryId: target,
        tags: [],
        icon: initialContainer ? 'lucide:box' : 'lucide:link',
        customImage: preview?.icon ?? undefined,
        isFavorite: false,
        status: 'unknown',
        openInNewTab: true,
        isVisible: true,
        order: siblings.length ? Math.max(...siblings.map(s => s.order)) + 1 : 0,
        stats: initialContainer
          ? { dockerEnabled: true, dockerContainer: initialContainer, alertThresholds: { cpuPercent: 80, ramPercent: 80 } }
          : {},
      });
      onCreated?.(id, target);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ajouter le lien");
    } finally {
      setSaving(false);
    }
  };

  const icon = preview?.icon && !iconFailed ? preview.icon : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[14vh]">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter un lien"
        // Opened through a view transition (morph from "Ajouter"); CSS pop otherwise.
        style={{ viewTransitionName: 'quick-add' }}
        className={`${MORPHS ? '' : 'animate-dialog-in '}relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-secondary-default shadow-waitlist`}
      >
        {/* Address */}
        <div className="flex items-center gap-2 border-b border-separator-border px-4 py-3">
          <RiLink className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <input
            ref={urlRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Collez une adresse…"
            aria-label="Adresse du lien"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-headline-regular text-text-primary outline-none placeholder:text-text-placeholder"
          />
          {loading && <RiLoader4Line className="size-4 shrink-0 animate-spin text-foreground-icon-tertiary" aria-label="Lecture de la page" />}
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* Preview: icon + editable name */}
          <div
            className={cx(
              'flex items-center gap-3 rounded-2xl bg-background-primary-default p-3 shadow-card transition-opacity',
              !valid && 'opacity-50',
            )}
          >
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-background-tertiary-default">
              {icon ? (
                <img src={icon} alt="" className="size-7 rounded-md bg-control-indicator-background object-contain p-0.5" onError={() => setIconFailed(true)} />
              ) : (
                <span className="text-title-3-semibold text-text-secondary">
                  {(finalName || '?').charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <input
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setNameEdited(true);
                }}
                placeholder={host || 'Nom du lien'}
                aria-label="Nom du lien"
                disabled={!valid}
                className="min-w-0 bg-transparent text-body-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
              <span className="truncate text-body-2-regular text-text-tertiary">
                {preview?.description || host || 'Le nom et l’icône se remplissent tout seuls'}
              </span>
            </div>
          </div>

          {/* Folder */}
          <div className="flex flex-col gap-2">
            <span className="text-caption-1-medium tracking-[0.1em] text-text-tertiary uppercase">Dossier</span>
            <div role="radiogroup" aria-label="Dossier" className="flex flex-wrap gap-1.5">
              {folders.map(f => {
                const on = newFolder === null && folderId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setFolderId(f.id);
                      setNewFolder(null);
                      setFolderChosen(true);
                    }}
                    className={cx(
                      'flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-body-medium outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                      on
                        ? 'border-transparent bg-background-primary-default text-text-primary shadow-card'
                        : 'border-border-button-default text-text-secondary hover:border-border-button-hover hover:text-text-primary',
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: folderColor(f.color) }} />
                    {f.name}
                  </button>
                );
              })}
              {newFolder === null ? (
                <button
                  type="button"
                  onClick={() => {
                    setNewFolder('');
                    setFolderChosen(true);
                  }}
                  className="flex h-8 cursor-pointer items-center gap-1 rounded-full border border-dashed border-border-button-hover px-3 text-body-regular text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <RiAddLine className="size-4" aria-hidden /> Nouveau
                </button>
              ) : (
                <input
                  autoFocus
                  value={newFolder}
                  onChange={e => setNewFolder(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setNewFolder(null);
                    }
                  }}
                  placeholder="Nom du dossier"
                  aria-label="Nom du nouveau dossier"
                  className="h-8 w-40 rounded-full bg-background-tertiary-default px-3 text-body-regular text-text-primary outline-none ring-2 ring-border-focus-ring placeholder:text-text-placeholder"
                />
              )}
            </div>
          </div>

          {error && <p className="text-body-2-regular text-text-error-primary">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-separator-border px-4 py-3">
          <span className="hidden items-center gap-1.5 text-body-2-regular text-text-tertiary sm:flex">
            Astuce : collez une adresse n'importe où sur l'accueil
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="small" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" size="small" disabled={!valid || saving}>
              {saving ? 'Ajout…' : 'Ajouter'}
              {!saving && (
                <Kbd className="ml-1 bg-white/20 text-white">
                  <RiCornerDownLeftLine className="size-3" aria-hidden />
                </Kbd>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RiAddLine, RiArrowRightUpLine, RiFolderAddLine } from '@remixicon/react';
import type { Category, Service } from '../types';
import { byOrder, getDragged, INTERNAL_DRAG, isInternalDrag, linksIn, setDragged } from '../lib/links';
import { folderColor } from '../theme/folders';
import { LinkIcon } from './LinkIcon';
import { cx } from '../utils/cx';

/**
 * Folder tree of the sidebar: the only list of categories and links.
 *
 * Folders sit on a hairline rail; the selected one gets a short bar in its
 * colour on the rail and opens (one at a time) to show its links, joined by
 * rounded connectors. Hovering a link draws the connector down to it in the
 * folder's colour and lights up its card in the grid; clicking opens it.
 *
 * Everything can be rearranged by dragging: links within and between
 * folders, folders among themselves, cards from the grid onto a folder. A URL
 * dragged from the browser onto a folder starts the quick-add for it.
 */

const SEPARATOR = 'var(--color-separator-border)';
const ACCENT = 'var(--color-accent-500)';
/** Hovering a closed folder during a drag opens it after this long. */
const OPEN_DELAY = 500;

type LinkDrop = { folderId: string; index: number } | null;
type FolderDrop = number | null;

export function LinkTree({
  categories,
  services,
  selected,
  onSelect,
  onHoverLink,
  onAddLink,
  onMoveLink,
  onMoveFolder,
  onCreateFolder,
}: {
  categories: Category[];
  services: Service[];
  /** Open folder id, or 'all' for none. */
  selected: string;
  onSelect: (id: string) => void;
  onHoverLink: (service: Service | null) => void;
  onAddLink: (folderId: string, url?: string) => void;
  /** `index` counts positions in the target folder without the moved link. */
  onMoveLink: (id: string, folderId: string, index: number) => void;
  onMoveFolder: (id: string, index: number) => void;
  onCreateFolder: (name: string) => Promise<void>;
}) {
  const folders = [...categories].sort(byOrder);
  const total = services.filter(s => s.isVisible).length;

  const [openId, setOpenId] = useState<string | null>(selected === 'all' ? null : selected);
  const [active, setActive] = useState(0);
  const [linkDrop, setLinkDrop] = useState<LinkDrop>(null);
  const [folderDrop, setFolderDrop] = useState<FolderDrop>(null);
  const [into, setInto] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const openTimer = useRef<number | undefined>(undefined);

  const navRef = useRef<HTMLElement>(null);
  const headers = useRef(new Map<string, HTMLElement>());
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);

  // The open folder follows the selection (a drag can peek into another).
  useEffect(() => {
    setOpenId(selected === 'all' ? null : selected);
    setActive(0);
  }, [selected]);

  // Keep the rail bar on the selected header while folders above it animate.
  useLayoutEffect(() => {
    let frame = 0;
    const start = performance.now();
    const measure = () => {
      const el = headers.current.get(selected);
      const nav = navRef.current;
      if (!el || !nav) setBar(null);
      if (el && nav) {
        const top = el.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
        setBar(prev => (prev && prev.top === top && prev.height === el.offsetHeight ? prev : { top, height: el.offsetHeight }));
      }
      if (performance.now() - start < 450) frame = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [selected, openId, categories.length, total]);

  const clearDrag = () => {
    window.clearTimeout(openTimer.current);
    setLinkDrop(null);
    setFolderDrop(null);
    setInto(null);
    setDraggingId(null);
    setDragged(null);
  };

  const hasUrl = (e: React.DragEvent) =>
    !getDragged() && !isInternalDrag(e) && Array.from(e.dataTransfer.types).includes('text/uri-list');

  const selectedColor =
    selected === 'all' ? ACCENT : folderColor(categories.find(c => c.id === selected)?.color);

  const submitFolder = async () => {
    const name = newName.trim();
    setCreating(false);
    setNewName('');
    if (name) await onCreateFolder(name);
  };

  return (
    <nav
      ref={navRef}
      aria-label="Dossiers de liens"
      className="relative select-none"
      onMouseLeave={() => onHoverLink(null)}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setLinkDrop(null);
          setFolderDrop(null);
          setInto(null);
        }
      }}
    >
      {/* Rail + the selected folder's bar */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-separator-border" />
      {bar && (
        <span
          aria-hidden
          className="absolute left-0 w-0.5 -translate-x-[0.5px] rounded-full transition-[top,height,background-color] duration-300 ease-out"
          style={{ top: bar.top + 6, height: bar.height - 12, backgroundColor: selectedColor }}
        />
      )}

      <ul className="flex flex-col gap-0.5">
        {folders.map((folder, folderIndex) => {
          const color = folderColor(folder.color);
          const links = linksIn(services, folder.id);
          const isOpen = openId === folder.id;
          const isSelected = selected === folder.id;
          const rows = links.length + 1; // + the "add a link" row

          return (
            <li key={folder.id} className="relative" style={{ '--folder': color } as React.CSSProperties}>
              {folderDrop === folderIndex && <DropLine className="top-0 left-5" color={ACCENT} />}
              {folderDrop === folderIndex + 1 && folderIndex === folders.length - 1 && (
                <DropLine className="bottom-0 left-5" color={ACCENT} />
              )}

              <button
                ref={el => {
                  if (el) headers.current.set(folder.id, el);
                }}
                type="button"
                draggable
                aria-expanded={isOpen}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(folder.id)}
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', folder.name);
                  e.dataTransfer.setData(INTERNAL_DRAG, folder.id);
                  setDragged({ kind: 'folder', id: folder.id });
                }}
                onDragEnd={clearDrag}
                onDragOver={e => {
                  const d = getDragged();
                  if (d?.kind === 'folder') {
                    if (d.id === folder.id) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    setFolderDrop(folderIndex + (e.clientY > r.top + r.height / 2 ? 1 : 0));
                    return;
                  }
                  if (d?.kind === 'link' || hasUrl(e)) {
                    e.preventDefault();
                    setLinkDrop(null);
                    if (into !== folder.id) {
                      setInto(folder.id);
                      window.clearTimeout(openTimer.current);
                      if (!isOpen && d) openTimer.current = window.setTimeout(() => setOpenId(folder.id), OPEN_DELAY);
                    }
                  }
                }}
                onDrop={e => {
                  const d = getDragged();
                  e.preventDefault();
                  e.stopPropagation();
                  if (d?.kind === 'folder' && folderDrop !== null) {
                    const from = folders.findIndex(f => f.id === d.id);
                    onMoveFolder(d.id, folderDrop > from ? folderDrop - 1 : folderDrop);
                  } else if (d?.kind === 'link') {
                    onMoveLink(d.id, folder.id, links.filter(l => l.id !== d.id).length);
                  } else {
                    const url = e.dataTransfer.getData('text/uri-list').split('\n')[0]?.trim();
                    if (url) onAddLink(folder.id, url);
                  }
                  clearDrag();
                }}
                className={cx(
                  'flex w-full cursor-pointer items-baseline gap-2 rounded-lg py-1.5 pr-2 pl-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                  'text-body-medium transition-colors duration-200',
                  isSelected ? 'text-text-primary' : 'text-text-tertiary hover:text-text-secondary',
                  into === folder.id && 'bg-background-secondary-hover text-text-primary',
                )}
              >
                <span className="min-w-0 truncate">{folder.name}</span>
                <span className="text-body-2-regular text-text-tertiary tabular-nums">{links.length}</span>
              </button>

              {/* Links */}
              <div
                className={cx(
                  'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="overflow-hidden" inert={!isOpen}>
                  {/* Remounted on each opening so the cascade replays. */}
                  <ul
                    key={isOpen ? 'open' : 'closed'}
                    className={cx('ml-5 pt-0.5 pb-2', isOpen && 'tree-cascade')}
                    onMouseLeave={() => onHoverLink(null)}
                  >
                    {links.map((link, i) => {
                      const lit = i <= active;
                      const here = i === active;
                      const dropHere = linkDrop?.folderId === folder.id ? linkDrop.index : null;
                      return (
                        <li
                          key={link.id}
                          style={{ '--i': i } as React.CSSProperties}
                          className={cx('relative h-8', draggingId === link.id && 'opacity-40')}
                          onDragOver={e => {
                            const d = getDragged();
                            if (d?.kind !== 'link') return;
                            e.preventDefault();
                            e.stopPropagation();
                            setInto(null);
                            const r = e.currentTarget.getBoundingClientRect();
                            setLinkDrop({ folderId: folder.id, index: i + (e.clientY > r.top + r.height / 2 ? 1 : 0) });
                          }}
                          onDrop={e => {
                            const d = getDragged();
                            if (d?.kind !== 'link' || !linkDrop) return;
                            e.preventDefault();
                            e.stopPropagation();
                            const from = links.findIndex(l => l.id === d.id);
                            const index = from !== -1 && linkDrop.index > from ? linkDrop.index - 1 : linkDrop.index;
                            onMoveLink(d.id, folder.id, index);
                            clearDrag();
                          }}
                        >
                          <Connector
                            trunk={i < rows - 1 ? (i < active ? color : SEPARATOR) : null}
                            elbowLeft={lit ? color : SEPARATOR}
                            elbowBottom={here ? color : SEPARATOR}
                            delay={i * 30}
                          />
                          {dropHere === i && <DropLine className="top-0 left-4" color={color} />}
                          {dropHere === i + 1 && i === links.length - 1 && <DropLine className="bottom-0 left-4" color={color} />}
                          <a
                            href={link.url}
                            target={link.openInNewTab ? '_blank' : undefined}
                            rel="noopener noreferrer"
                            draggable
                            title={link.url}
                            onMouseEnter={() => {
                              setActive(i);
                              onHoverLink(link);
                            }}
                            onFocus={() => {
                              setActive(i);
                              onHoverLink(link);
                            }}
                            onDragStart={e => {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', link.url);
                              e.dataTransfer.setData(INTERNAL_DRAG, link.id);
                              setDragged({ kind: 'link', id: link.id });
                              // Let the browser snapshot the row before it fades.
                              requestAnimationFrame(() => setDraggingId(link.id));
                            }}
                            onDragEnd={clearDrag}
                            className={cx(
                              'tree-item group/link ml-4 flex h-8 items-center gap-2 rounded-lg pr-2 pl-1.5 outline-none',
                              'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                            )}
                          >
                            <span
                              className={cx(
                                'grid size-4 place-items-center transition-colors duration-200',
                                here ? '' : 'text-foreground-icon-tertiary',
                              )}
                              style={here ? { color } : undefined}
                            >
                              <LinkIcon service={link} size={16} className={cx(!here && 'opacity-70 grayscale')} />
                            </span>
                            <span
                              className={cx(
                                'min-w-0 truncate transition-colors duration-200',
                                here ? 'text-body-semibold text-text-primary' : 'text-body-regular text-text-secondary',
                              )}
                            >
                              {link.name}
                            </span>
                            {link.status === 'offline' && (
                              <span className="size-1.5 shrink-0 rounded-full bg-chart-3" title="Hors ligne" />
                            )}
                            <RiArrowRightUpLine
                              className="ml-auto size-3.5 shrink-0 text-foreground-icon-tertiary opacity-0 transition-opacity group-hover/link:opacity-100"
                              aria-hidden
                            />
                          </a>
                        </li>
                      );
                    })}

                    {/* Add a link to this folder */}
                    <li
                      className="relative h-8"
                      style={{ '--i': links.length } as React.CSSProperties}
                      onDragOver={e => {
                        const d = getDragged();
                        if (d?.kind !== 'link') return;
                        e.preventDefault();
                        e.stopPropagation();
                        setLinkDrop({ folderId: folder.id, index: links.length });
                      }}
                      onDrop={e => {
                        const d = getDragged();
                        if (d?.kind !== 'link') return;
                        e.preventDefault();
                        e.stopPropagation();
                        onMoveLink(d.id, folder.id, links.filter(l => l.id !== d.id).length);
                        clearDrag();
                      }}
                    >
                      <Connector trunk={null} elbowLeft={SEPARATOR} elbowBottom={SEPARATOR} delay={0} />
                      {links.length === 0 && linkDrop?.folderId === folder.id && (
                        <DropLine className="top-0 left-4" color={color} />
                      )}
                      <button
                        type="button"
                        onClick={() => onAddLink(folder.id)}
                        className="tree-item ml-4 flex h-8 w-[calc(100%-1rem)] cursor-pointer items-center gap-2 rounded-lg pr-2 pl-1.5 text-body-regular text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                      >
                        <RiAddLine className="size-4 shrink-0" aria-hidden />
                        Ajouter un lien
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </li>
          );
        })}

        {/* New folder */}
        <li className="pt-2">
          {creating ? (
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitFolder();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                }
              }}
              onBlur={submitFolder}
              placeholder="Nom du dossier"
              aria-label="Nom du nouveau dossier"
              className="ml-5 h-8 w-[calc(100%-1.25rem)] rounded-lg bg-background-tertiary-default px-2 text-body-regular text-text-primary outline-none placeholder:text-text-placeholder focus:ring-2 focus:ring-border-focus-ring"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-2 pl-5 text-body-regular text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <RiFolderAddLine className="size-4" aria-hidden />
              Nouveau dossier
            </button>
          )}
        </li>
      </ul>
    </nav>
  );
}

/**
 * The tree line of one row: an optional trunk down the whole row (to the
 * rows below) and a rounded elbow from the top to the row's centre. Left and
 * bottom edges of the elbow colour separately, so the path lights up to the
 * active row only.
 */
function Connector({
  trunk,
  elbowLeft,
  elbowBottom,
  delay,
}: {
  trunk: string | null;
  elbowLeft: string;
  elbowBottom: string;
  delay: number;
}) {
  const transition = { transitionDelay: `${delay}ms` };
  return (
    <>
      {trunk && (
        <span
          aria-hidden
          className="tree-line absolute top-0 bottom-0 left-0 w-px transition-colors duration-200"
          style={{ backgroundColor: trunk, ...transition }}
        />
      )}
      <span
        aria-hidden
        className="tree-line absolute top-0 left-0 h-4 w-3 rounded-bl-[7px] border-b border-l transition-colors duration-200"
        style={{ borderLeftColor: elbowLeft, borderBottomColor: elbowBottom, ...transition }}
      />
    </>
  );
}

function DropLine({ className, color }: { className?: string; color: string }) {
  return (
    <span
      aria-hidden
      className={cx('pointer-events-none absolute right-0 z-10 h-0.5 -translate-y-1/2 rounded-full', className)}
      style={{ backgroundColor: color }}
    />
  );
}

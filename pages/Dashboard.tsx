import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { RiAddLine, RiCheckLine, RiCloseLine, RiLink, RiMoonClearLine } from '@remixicon/react';
import { useDashboard } from '../store';
import { ServiceTile } from '../components/ServiceTile';
import { BentoCard, ServiceIcon, ServiceRow, TextLink, isBentoHero } from '../components/views';
import { ServiceMenu, type MenuAnchor } from '../components/ServiceMenu';
import { StatusBar } from '../components/StatusBar';
import { HomeWidgets } from '../components/ha/HomeWidgets';
import { Dock } from '../components/Dock';
import { SelectionBar } from '../components/SelectionBar';
import { Button } from '../components/ui/button';
import type { Category, Service } from '../types';
import {
  getDragged,
  INTERNAL_DRAG,
  isInternalDrag,
  linksIn,
  looksLikeUrl,
  moveLink,
  onDraggedChange,
  setDragged,
  treeOrder,
} from '../lib/links';
import { isTyping, withViewTransition } from '../lib/actions';
import { armFlip, useFlip } from '../lib/motion';
import { sectionId, useShell } from '../lib/shell';
import { folderColor, folderTint } from '../theme/folders';
import { Doodle, PenUnderline } from '../components/Doodle';
import { cx } from '../utils/cx';

/**
 * Home page: the status bar, then every category as a stacked section of
 * tiles on one scrolling page. The sidebar jumps between sections and
 * follows the scroll.
 *
 * Adding: the status bar's button, N, pasting an address anywhere, or
 * dropping a URL on the page. Tiles drag between and within sections, or
 * onto a category in the sidebar.
 */

const TILE_MIN = { compact: '170px', normal: '200px', spacious: '240px' } as const;
const ORPHANS = '__orphans__';

/** Container of a section's links for each display style (styles in index.css). */
const CONTAINER = { cards: 'tile-grid', list: 'list-view', icons: 'icon-grid', bento: 'bento-grid', text: 'text-list' } as const;
/** Styles where items stack vertically: drops go above / below. */
const VERTICAL = { cards: false, list: true, icons: false, bento: false, text: true } as const;
/** Reach of the pointer glow on tiles (the largest radial-gradient in index.css). */
const SPOT = 260;

type Section = { id: string; category: Category | null; name: string; color?: string; links: Service[] };

export const Dashboard: React.FC = () => {
  const { data, isLoading, reorderServices, toggleFavorite, logAccess } = useDashboard();
  const shell = useShell();
  const { issuesOnly, setIssuesOnly, setActiveCategory, justAdded, openQuickAdd, hoveredLink, nightFocus, setNightFocus, view } = shell;
  const location = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [cardDrop, setCardDrop] = useState<{ id: string; after: boolean } | null>(null);
  const [sectionDrop, setSectionDrop] = useState<string | null>(null);
  const [draggingCard, setDraggingCard] = useState<string | null>(null);
  const [urlOver, setUrlOver] = useState(false);
  const dragDepth = useRef(0);
  const spotFrame = useRef(0);
  const flipRef = useFlip<HTMLDivElement>();

  // Multi-selection: Shift+click a tile (then plain clicks while a selection
  // exists), or "Sélectionner" in its menu. Escape clears it.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggleSelected = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  useEffect(() => {
    if (!selected.size) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(new Set());
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size]);
  // Deleted links leave the selection.
  useEffect(() => {
    setSelected(prev => {
      const alive = new Set([...prev].filter(id => data.services.some(s => s.id === id)));
      return alive.size === prev.size ? prev : alive;
    });
  }, [data.services]);

  // Back online (offline → online): the tile celebrates for a moment.
  const [celebrating, setCelebrating] = useState<Set<string>>(() => new Set());
  const lastStatus = useRef(new Map<string, string>());
  useEffect(() => {
    const back: string[] = [];
    // Monitor statuses only: the stored status can be stale on load.
    for (const [id, h] of Object.entries(data.health)) {
      const prev = lastStatus.current.get(id);
      if (prev === 'offline' && h.status === 'online') back.push(id);
      lastStatus.current.set(id, h.status);
    }
    if (!back.length) return;
    setCelebrating(prev => new Set([...prev, ...back]));
    const t = window.setTimeout(
      () => setCelebrating(prev => new Set([...prev].filter(id => !back.includes(id)))),
      2600,
    );
    return () => window.clearTimeout(t);
  }, [data.health]);

  /** Border beam: live activity, or a recovery within the last three minutes. */
  const isActive = (id: string) => {
    if (data.widgets[id]?.active) return true;
    const h = data.health[id]?.history ?? [];
    const recent = h.slice(-6);
    return recent.length > 1 && recent[recent.length - 1].up && recent.some(x => !x.up);
  };

  // Spotlight (21st.dev "Spotlight Card"): every tile near the pointer picks
  // up a glow on its border, as if one light moved across the grid.
  const tilted = useRef<HTMLElement | null>(null);
  const lit = useRef<Set<HTMLElement>>(new Set());
  const resetTilt = (tile: HTMLElement) => {
    for (const v of ['--rx', '--ry', '--lx', '--ly']) tile.style.removeProperty(v);
  };
  const trackSpotlight = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const { clientX, clientY } = e;
    const hovered = (e.target as Element).closest<HTMLElement>('.tile');
    cancelAnimationFrame(spotFrame.current);
    spotFrame.current = requestAnimationFrame(() => {
      // The glow reaches 260 px: only tiles that close get it, and all rects
      // are read before anything is written (one layout per frame, not one per tile).
      const tiles = [...document.querySelectorAll<HTMLElement>('.tile')];
      const rects = tiles.map(tile => tile.getBoundingClientRect());
      const near = new Set<HTMLElement>();
      tiles.forEach((tile, i) => {
        const r = rects[i];
        if (clientX < r.left - SPOT || clientX > r.right + SPOT || clientY < r.top - SPOT || clientY > r.bottom + SPOT) return;
        near.add(tile);
        tile.style.setProperty('--mx', `${clientX - r.left}px`);
        tile.style.setProperty('--my', `${clientY - r.top}px`);
      });
      for (const tile of lit.current) {
        if (near.has(tile)) continue;
        tile.style.removeProperty('--mx');
        tile.style.removeProperty('--my');
      }
      lit.current = near;
      // The hovered card tilts toward the pointer; its logo floats the other way.
      if (tilted.current && tilted.current !== hovered) resetTilt(tilted.current);
      tilted.current = hovered;
      if (hovered) {
        const r = hovered.getBoundingClientRect();
        const px = (clientX - r.left) / r.width; // 0 … 1
        const py = (clientY - r.top) / r.height;
        hovered.style.setProperty('--rx', `${((0.5 - py) * 14).toFixed(2)}deg`);
        hovered.style.setProperty('--ry', `${((px - 0.5) * 16).toFixed(2)}deg`);
        hovered.style.setProperty('--lx', `${((px - 0.5) * -6).toFixed(1)}px`);
        hovered.style.setProperty('--ly', `${((py - 0.5) * -6).toFixed(1)}px`);
        hovered.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
        hovered.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
      }
    });
  };

  const density = data.theme.density;
  const paper = data.theme.skin === 'paper';

  const sections = useMemo<Section[]>(() => {
    const cats = [...data.categories].sort((a, b) => a.order - b.order);
    const known = new Set(cats.map(c => c.id));
    const list: Section[] = cats.map(c => ({
      id: c.id,
      category: c,
      name: c.name,
      color: c.color,
      links: linksIn(data.services, c.id),
    }));
    const orphans = data.services.filter(s => s.isVisible && !known.has(s.categoryId));
    if (orphans.length) list.push({ id: ORPHANS, category: null, name: 'Sans catégorie', links: orphans });
    return list;
  }, [data.services, data.categories]);

  const favoriteIndex = useMemo(() => {
    const map = new Map<string, number>();
    treeOrder(data.services, data.categories)
      .filter(s => s.isFavorite)
      .forEach((s, i) => map.set(s.id, i));
    return map;
  }, [data.services, data.categories]);

  const down = data.services.filter(s => s.isVisible && s.status === 'offline').length;

  // The domain most links live under, so tiles show `n8n`, not `n8n.example.com`.
  const baseDomain = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data.services) {
      try {
        const labels = new URL(s.url).hostname.split('.');
        if (labels.length > 2) {
          const base = labels.slice(-2).join('.');
          counts.set(base, (counts.get(base) ?? 0) + 1);
        }
      } catch {
        // Not a URL.
      }
    }
    const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return best && best[1] >= 3 ? best[0] : null;
  }, [data.services]);

  // Back to everything once the outage is over.
  useEffect(() => {
    if (issuesOnly && down === 0 && !isLoading) setIssuesOnly(false);
  }, [issuesOnly, down, isLoading, setIssuesOnly]);

  // Paste an address anywhere on the page to add it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      const text = e.clipboardData?.getData('text') ?? '';
      if (looksLikeUrl(text)) {
        e.preventDefault();
        openQuickAdd({ url: text.trim() });
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [openQuickAdd]);

  useEffect(
    () =>
      onDraggedChange(d => {
        if (!d) {
          setCardDrop(null);
          setSectionDrop(null);
          setDraggingCard(null);
        }
      }),
    [],
  );

  // Arriving from elsewhere with a section to show (sidebar, g + letter).
  useEffect(() => {
    const target = (location.state as { section?: string } | null)?.section;
    if (!target || isLoading) return;
    requestAnimationFrame(() => document.getElementById(sectionId(target))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    navigate('.', { replace: true, state: null });
  }, [location.state, isLoading, navigate]);

  // Scroll spy: the section nearest the top of the viewport lights up in the sidebar.
  useEffect(() => {
    const els = sections.map(s => document.getElementById(sectionId(s.id))).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const root = els[0].closest('main');
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          const id = e.target.id.replace(/^section-/, '');
          if (e.isIntersecting) visible.set(id, e.boundingClientRect.top);
          else visible.delete(id);
        }
        const first = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        setActiveCategory(first ? first[0] : null);
      },
      { root, rootMargin: '0px 0px -55% 0px', threshold: 0 },
    );
    els.forEach(el => observer.observe(el));
    return () => {
      observer.disconnect();
      setActiveCategory(null);
    };
  }, [sections, setActiveCategory]);

  const moveTo = (id: string, folderId: string, index: number) => {
    armFlip();
    return reorderServices(moveLink(data.services, id, folderId, index)).catch(() => shell.notify('Déplacement impossible', 'err'));
  };

  // A URL dragged in from another tab or the address bar.
  const isUrlDrag = (e: React.DragEvent) =>
    !getDragged() && !isInternalDrag(e) && Array.from(e.dataTransfer.types).includes('text/uri-list');

  let tileIndex = 0;
  // Empty categories stay in the sidebar tree (with its "+"), not on the page.
  const hasFavorites = data.services.some(s => s.isVisible && s.isFavorite);
  const focus = nightFocus && hasFavorites && !issuesOnly;
  const shown = focus
    ? []
    : sections
        .map(s => ({ ...s, visibleLinks: issuesOnly ? s.links.filter(l => l.status === 'offline') : s.links }))
        .filter(s => s.visibleLinks.length > 0);

  return (
    <div
      ref={flipRef}
      className="relative"
      onPointerMove={trackSpotlight}
      onPointerLeave={() => {
        if (tilted.current) resetTilt(tilted.current);
        tilted.current = null;
      }}
      onDragEnter={e => {
        if (!isUrlDrag(e)) return;
        dragDepth.current += 1;
        setUrlOver(true);
      }}
      onDragLeave={e => {
        if (!isUrlDrag(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setUrlOver(false);
      }}
      onDragOver={e => isUrlDrag(e) && e.preventDefault()}
      onDrop={e => {
        dragDepth.current = 0;
        setUrlOver(false);
        if (getDragged() || isInternalDrag(e)) return;
        const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).split('\n')[0]?.trim();
        if (url && looksLikeUrl(url)) {
          e.preventDefault();
          openQuickAdd({ url });
        }
      }}
    >
      <ServiceMenu anchor={menu} onClose={() => setMenu(null)} onSelect={toggleSelected} />
      {selected.size > 0 && (
        <SelectionBar
          ids={[...selected]}
          onClear={() => setSelected(new Set())}
          onSelectAll={() => setSelected(new Set(shown.flatMap(s => s.visibleLinks.map(l => l.id))))}
        />
      )}

      {urlOver && (
        <div className="pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-3xl border-2 border-dashed border-border-focus-ring bg-background-full/70">
          <span className="flex items-center gap-2 rounded-full bg-background-secondary-default px-4 py-2 text-body-medium text-text-primary shadow-lg">
            <RiLink className="size-5" aria-hidden /> Déposez pour ajouter le lien
          </span>
        </div>
      )}

      <div className="flex flex-col gap-8">
        <StatusBar />

        {!issuesOnly && <Dock />}

        {!issuesOnly && !focus && <HomeWidgets />}

        {focus && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default/40 px-4 py-2.5 text-body-2-regular text-text-tertiary">
            <span className="flex items-center gap-2">
              <RiMoonClearLine className="size-4" aria-hidden />
              Mode nuit · seuls les favoris sont affichés
            </span>
            <Button variant="plain" size="small" onClick={() => withViewTransition(() => setNightFocus(false))}>
              Tout afficher
            </Button>
          </div>
        )}

        {issuesOnly && (
          <div className="-mb-4 flex items-center justify-between gap-3 rounded-2xl bg-status-rose-background px-4 py-2 text-body-2-medium text-status-rose-text">
            <span>Services hors ligne uniquement</span>
            <Button
              variant="plain"
              size="small"
              leadingIcon={RiCloseLine}
              onClick={() => withViewTransition(() => setIssuesOnly(false))}
            >
              Tout afficher
            </Button>
          </div>
        )}

        <div className={view === 'text' ? 'text-columns' : 'contents'}>
        {shown.map(section => {
          const tint = folderTint(section.color);
          const offline = section.links.filter(l => l.status === 'offline').length;
          const isDropTarget = sectionDrop === section.id;
          const folderId = section.category?.id;
          return (
            <section
              key={section.id}
              id={sectionId(section.id)}
              aria-labelledby={`${sectionId(section.id)}-title`}
              className="group/section scroll-mt-3"
              onDragOver={e => {
                const d = getDragged();
                if (d?.kind !== 'link' || !folderId) return;
                e.preventDefault();
                if (sectionDrop !== section.id) setSectionDrop(section.id);
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setSectionDrop(null);
              }}
              onDrop={e => {
                const d = getDragged();
                if (d?.kind !== 'link' || !folderId) return;
                e.preventDefault();
                moveTo(d.id, folderId, section.links.filter(l => l.id !== d.id).length);
                setDragged(null);
              }}
            >
              <header className="mb-3 flex min-h-8 items-center gap-2.5 px-1">
                {paper ? (
                  <Doodle seed={sections.findIndex(s => s.id === section.id)} className="size-6" />
                ) : (
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} />
                )}
                <h2 id={`${sectionId(section.id)}-title`} className="section-title relative text-body-semibold text-text-primary">
                  {section.name}
                  {paper && <PenUnderline className="absolute -bottom-2 left-0 h-2.5 w-full text-text-primary" />}
                </h2>
                <span className="text-body-2-regular text-text-tertiary tabular-nums">{section.links.length}</span>
                {offline > 0 && (
                  <span className="rounded-md bg-status-rose-background px-1.5 text-caption-1-medium text-status-rose-text">
                    {offline} hors ligne
                  </span>
                )}
                {folderId && (
                  <button
                    type="button"
                    onClick={() => openQuickAdd({ folderId })}
                    aria-label={`Ajouter un lien dans ${section.name}`}
                    title={`Ajouter un lien dans ${section.name}`}
                    className="ml-auto grid size-7 cursor-pointer place-items-center rounded-lg text-foreground-icon-secondary opacity-0 transition-opacity outline-none group-hover/section:opacity-100 hover:bg-background-secondary-hover hover:text-foreground-icon-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-focus-ring [@media(pointer:coarse)]:opacity-100"
                  >
                    <RiAddLine className="size-4" aria-hidden />
                  </button>
                )}
              </header>

              {section.visibleLinks.length === 0 ? (
                <button
                  type="button"
                  onClick={() => folderId && openQuickAdd({ folderId })}
                  className={cx(
                    'flex h-16 w-full cursor-pointer items-center justify-center rounded-2xl border border-dashed text-body-2-regular transition-colors outline-none',
                    'focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                    isDropTarget
                      ? 'border-accent-400 bg-background-secondary-default text-text-primary'
                      : 'border-border-button-default text-text-tertiary hover:text-text-primary',
                  )}
                >
                  Catégorie vide · glissez un lien ici ou cliquez pour en ajouter un
                </button>
              ) : (
                <div
                  className={cx(
                    CONTAINER[view],
                    'transition-shadow',
                    view !== 'list' && 'rounded-2xl',
                    isDropTarget && !cardDrop && 'ring-2 ring-accent-400/40 ring-offset-4 ring-offset-background-full',
                  )}
                  style={{ '--tile-min': TILE_MIN[density] } as React.CSSProperties}
                >
                  {section.visibleLinks.map(service => {
                    const drop = cardDrop?.id === service.id ? cardDrop : null;
                    const i = tileIndex++;
                    return (
                      <div
                        key={service.id}
                        data-flip={service.id}
                        data-selected={selected.has(service.id) || undefined}
                        onClickCapture={e => {
                          if (!e.shiftKey && !selected.size) return;
                          e.preventDefault();
                          e.stopPropagation();
                          toggleSelected(service.id);
                        }}
                        draggable
                        onDragStart={e => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', service.url);
                          e.dataTransfer.setData(INTERNAL_DRAG, service.id);
                          setDragged({ kind: 'link', id: service.id });
                          requestAnimationFrame(() => setDraggingCard(service.id));
                        }}
                        onDragEnd={() => setDragged(null)}
                        onDragOver={e => {
                          const d = getDragged();
                          if (d?.kind !== 'link') return;
                          e.preventDefault();
                          e.stopPropagation();
                          if (sectionDrop) setSectionDrop(null);
                          if (d.id === service.id) return;
                          const r = e.currentTarget.getBoundingClientRect();
                          const after = VERTICAL[view] ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
                          if (drop?.after !== after) setCardDrop({ id: service.id, after });
                        }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) setCardDrop(null);
                        }}
                        onDrop={e => {
                          const d = getDragged();
                          if (d?.kind !== 'link' || !drop) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const siblings = linksIn(data.services, service.categoryId).filter(s => s.id !== d.id);
                          const at = siblings.findIndex(s => s.id === service.id);
                          moveTo(d.id, service.categoryId, at + (drop.after ? 1 : 0));
                          setDragged(null);
                        }}
                        className={cx(
                          'relative min-w-0',
                          view === 'bento' && (isBentoHero(service, data.widgets[service.id]) ? 'bento-hero' : 'bento-small'),
                          view === 'bento' && data.widgets[service.id]?.ok && data.widgets[service.id]?.summary && 'bento-hero-live',
                          draggingCard === service.id && 'opacity-40',
                        )}
                      >
                        {selected.has(service.id) && (
                          <span aria-hidden className="select-check">
                            <RiCheckLine className="size-3.5" />
                          </span>
                        )}
                        {drop && (
                          <span
                            aria-hidden
                            className={cx(
                              'pointer-events-none absolute z-10 rounded-full bg-accent-400',
                              VERTICAL[view]
                                ? cx('inset-x-2 h-0.5', drop.after ? '-bottom-px' : '-top-px')
                                : cx('inset-y-2 w-0.5', drop.after ? '-right-[6px]' : '-left-[6px]'),
                            )}
                          />
                        )}
                        {(() => {
                          const props = {
                            service,
                            health: data.health[service.id],
                            widget: data.widgets[service.id],
                            onOpen: () => logAccess(service.id),
                            active: isActive(service.id),
                            celebrate: celebrating.has(service.id),
                            favoriteIndex: favoriteIndex.get(service.id) ?? null,
                            highlight: justAdded === service.id || hoveredLink?.id === service.id ? folderColor(section.color) : null,
                            index: i,
                            baseDomain,
                            onToggleFavorite: () => toggleFavorite(service.id).catch(() => shell.notify('Échec de la mise à jour', 'err')),
                            onContextMenu: (e: React.MouseEvent | React.KeyboardEvent) => {
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              const pos = 'clientX' in e && e.clientX ? { x: e.clientX, y: e.clientY } : { x: r.left + 16, y: r.bottom - 8 };
                              setMenu({ service, ...pos });
                            },
                          };
                          switch (view) {
                            case 'list':
                              return <ServiceRow {...props} />;
                            case 'icons':
                              return <ServiceIcon {...props} />;
                            case 'text':
                              return <TextLink {...props} />;
                            case 'bento':
                              return isBentoHero(service, props.widget) ? (
                                <BentoCard {...props} />
                              ) : (
                                <ServiceTile {...props} density="compact" showDescription={data.theme.showDescriptions} />
                              );
                            default:
                              return <ServiceTile {...props} density={density} showDescription={data.theme.showDescriptions} />;
                          }
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        </div>

        {!isLoading && sections.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-3xl py-16 text-center">
            <p className="text-body-regular text-text-tertiary">Aucun lien pour l'instant.</p>
            <Button leadingIcon={RiAddLine} onClick={() => openQuickAdd()}>
              Ajouter un lien
            </Button>
            <p className="text-body-2-regular text-text-tertiary">ou collez une adresse n'importe où sur la page</p>
          </div>
        )}
      </div>
    </div>
  );
};

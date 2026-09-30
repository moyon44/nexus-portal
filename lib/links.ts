import type { Category, Service } from '../types';

/**
 * Link organisation shared by the home page tree and the card grid: one order
 * (folder order, then link order inside the folder), one move operation, and
 * the drag state both surfaces read.
 */

export const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/** Visible links of a folder, in their saved order. */
export function linksIn(services: Service[], folderId: string): Service[] {
  return services.filter(s => s.isVisible && s.categoryId === folderId).sort(byOrder);
}

/** Every visible link in tree order; links whose folder is gone come last. */
export function treeOrder(services: Service[], categories: Category[]): Service[] {
  const folders = [...categories].sort(byOrder);
  const known = new Set(folders.map(f => f.id));
  return [
    ...folders.flatMap(f => linksIn(services, f.id)),
    ...services.filter(s => s.isVisible && !known.has(s.categoryId)).sort(byOrder),
  ];
}

/**
 * The order/folder updates for moving `id` to position `index` of folder
 * `folderId` (index counted without the moved link). Only the target folder
 * is renumbered; the source folder keeps its relative order.
 */
export function moveLink(services: Service[], id: string, folderId: string, index: number) {
  const target = linksIn(services, folderId).filter(s => s.id !== id);
  const clamped = Math.max(0, Math.min(index, target.length));
  const ids = [...target.slice(0, clamped).map(s => s.id), id, ...target.slice(clamped).map(s => s.id)];
  return ids.map((sid, order) => ({ id: sid, categoryId: folderId, order }));
}

/** New folder order after dropping folder `id` at `index`. */
export function moveFolder(categories: Category[], id: string, index: number): string[] {
  const rest = [...categories].sort(byOrder).map(c => c.id).filter(cid => cid !== id);
  const clamped = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, clamped), id, ...rest.slice(clamped)];
}

/* ----- Drag state --------------------------------------------------------
 * HTML5 drag events can't read their payload during dragover, so the item
 * being dragged (from the tree or from a card) is kept here. */

export type Dragged = { kind: 'link' | 'folder'; id: string } | null;

let dragged: Dragged = null;
const listeners = new Set<(d: Dragged) => void>();

export const getDragged = () => dragged;

/** Tags a drag as ours, so page-level URL drops can tell it apart. */
export const INTERNAL_DRAG = 'application/x-portail-item';

export const isInternalDrag = (e: { dataTransfer: DataTransfer }) =>
  Array.from(e.dataTransfer.types).includes(INTERNAL_DRAG);

export function setDragged(next: Dragged) {
  dragged = next;
  listeners.forEach(l => l(next));
}

export function onDraggedChange(listener: (d: Dragged) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ----- URLs ----------------------------------------------------------------- */

/** Loose check for something the user means as an address (pasted or typed). */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t) || t.length > 2048) return false;
  if (/^https?:\/\//i.test(t)) return true;
  return /^(localhost|(\d{1,3}\.){3}\d{1,3}|[\w-]+(\.[\w-]+)*\.[a-z]{2,})(:\d+)?(\/.*)?$/i.test(t);
}

export function normalizeUrl(text: string): string {
  const t = text.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
}

import { flushSync } from 'react-dom';
import type { Category, Service } from '../types';
import { dockerApi } from '../api';

/**
 * What can be done with a link, shared by the tile menu (right click) and
 * the command palette so both always offer the same things.
 */

export function openService(service: Service, newTab = service.openInNewTab) {
  window.open(service.url, newTab ? '_blank' : '_self', newTab ? 'noopener' : undefined);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API unavailable (plain http): fall back to a selection copy.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Bound container, when the service is monitored through Docker. */
export function containerOf(service: Service): string | null {
  return service.stats?.dockerEnabled && service.stats.dockerContainer ? service.stats.dockerContainer : null;
}

export function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const isLocalHost = (host: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /\.(local|lan|home|internal)$/i.test(host) || !host.includes('.');

/**
 * SSH target for a service: the service's own machine when its address is
 * local (an IP, `thedoc:5678`, `nas.lan`), else the configured server (every
 * container runs there; public subdomains go through the proxy).
 */
export function sshTargetFor(service: Service | null, serverTarget: string | undefined): string | null {
  const server = serverTarget?.trim() || null;
  if (service) {
    try {
      const host = new URL(service.url).hostname;
      if (isLocalHost(host)) {
        const user = server?.includes('@') ? server.split('@')[0] + '@' : '';
        return user + host;
      }
    } catch {
      // Not a URL: fall back to the server.
    }
  }
  return server;
}

/** Opens the SSH client (ssh:// handler) and copies the command as a fallback. */
export async function openSsh(target: string): Promise<void> {
  await copyText(`ssh ${target}`);
  window.location.href = `ssh://${target}`;
}

export async function restartContainer(name: string): Promise<void> {
  await dockerApi.restartContainer(name);
}

/* ----- Keyboard: `g` + letter jumps to a category ------------------------ */

const firstLetters = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/**
 * One letter per category: its initial, or the next unused letter of its
 * name on a collision (Media → m, Monitoring → o).
 */
export function categoryKeys(categories: Category[]): Map<string, string> {
  const keys = new Map<string, string>();
  const used = new Set<string>();
  for (const c of [...categories].sort((a, b) => a.order - b.order)) {
    const key = [...firstLetters(c.name)].find(l => !used.has(l));
    if (key) {
      keys.set(c.id, key);
      used.add(key);
    }
  }
  return keys;
}

/* ----- View transitions --------------------------------------------------- */

/** Runs a React state update inside a view transition when supported. */
export function withViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}

export function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)
  );
}

import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { dockerService } from './docker.js';
import { checkNow } from './monitor.js';

/**
 * Docker auto-discovery, like Homepage: a container carrying `nexus.*` labels
 * gets its tile on its own.
 *
 *   labels:
 *     nexus.name: N8N                        # required
 *     nexus.url: https://n8n.example.com     # required
 *     nexus.group: Infrastructure            # category, created if missing
 *     nexus.icon: di:n8n                     # optional (dashboard-icons slug or Iconify)
 *     nexus.description: Automatisations     # optional
 *
 * The tile is bound to the container (status, CPU/RAM, restart). Discovered
 * tiles are marked `stats.discovered`; labels win on each sync for those,
 * while a tile created by hand for the same container is never touched.
 * Removing the labels or the container leaves the tile in place (it then
 * shows offline) so nothing disappears silently.
 */

const SYNC_INTERVAL = 60_000;
const DEFAULT_GROUP = 'Découverts';
const GROUP_COLORS = ['bg-cyan-500', 'bg-indigo-500', 'bg-teal-500', 'bg-blue-500', 'bg-purple-500', 'bg-lime-500'];

export interface DiscoveredContainer {
  container: string;
  name: string;
  url: string;
  group: string;
  icon?: string;
  description?: string;
  serviceId?: string;
}

function parseStats(raw: unknown): any {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

/** Labelled containers, whether or not a tile exists for them yet. */
export async function listDiscoverable(): Promise<DiscoveredContainer[]> {
  const containers = await dockerService.listContainers(true);
  return containers
    .filter((c) => c.labels['nexus.name'] && c.labels['nexus.url'])
    .map((c) => ({
      container: c.name,
      name: c.labels['nexus.name'],
      url: c.labels['nexus.url'],
      group: c.labels['nexus.group'] || DEFAULT_GROUP,
      icon: c.labels['nexus.icon'],
      description: c.labels['nexus.description'],
    }));
}

async function categoryFor(group: string): Promise<string> {
  const existing = await db('categories').whereRaw('lower(name) = ?', [group.toLowerCase()]).first();
  if (existing) return existing.id;
  const all = await db('categories').select('color', 'order');
  const used = new Set(all.map((c: any) => c.color));
  const id = uuidv4();
  await db('categories').insert({
    id,
    name: group,
    color: GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[0],
    icon: 'lucide:folder',
    order: all.reduce((max: number, c: any) => Math.max(max, c.order + 1), 0),
  });
  return id;
}

export async function syncDiscovered(): Promise<DiscoveredContainer[]> {
  const found = await listDiscoverable();
  if (found.length === 0) return found;

  const services = await db('services').select('id', 'stats', 'order', 'category_id');
  const byContainer = new Map<string, { id: string; discovered: boolean }>();
  for (const s of services) {
    const stats = parseStats(s.stats);
    if (stats.dockerContainer) byContainer.set(stats.dockerContainer, { id: s.id, discovered: !!stats.discovered });
  }

  for (const item of found) {
    const known = byContainer.get(item.container);
    const stats = { dockerEnabled: true, dockerContainer: item.container, discovered: true };
    if (known && !known.discovered) {
      item.serviceId = known.id; // Hand-made tile: leave it alone.
      continue;
    }
    const categoryId = await categoryFor(item.group);
    if (known) {
      await db('services')
        .where('id', known.id)
        .update({
          name: item.name,
          url: item.url,
          category_id: categoryId,
          description: item.description ?? null,
          ...(item.icon ? { icon: item.icon } : {}),
          updated_at: new Date(),
        });
      item.serviceId = known.id;
      continue;
    }

    const id = uuidv4();
    const order = services.filter((s: any) => s.category_id === categoryId).length;
    await db('services').insert({
      id,
      name: item.name,
      description: item.description ?? null,
      url: item.url,
      category_id: categoryId,
      tags: JSON.stringify(['docker']),
      icon: item.icon || 'lucide:box',
      open_in_new_tab: true,
      is_visible: true,
      order,
      stats: JSON.stringify(stats),
    });
    item.serviceId = id;
    console.log(`✓ Discovered ${item.container} → "${item.name}" (${item.group})`);
    checkNow(id);
  }
  return found;
}

export function startDiscovery(): void {
  const run = () => syncDiscovered().catch((e) => console.error('Docker discovery error:', e.message));
  run();
  setInterval(run, SYNC_INTERVAL);
}

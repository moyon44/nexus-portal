import type { ServiceHealth, Widget, IntegrationConfig, ContainerOverview } from './types';

// Build API URL dynamically
const getApiUrl = () => {
  // If running locally
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:5000';
  }

  // For external access via Cloudflare Zero Trust
  // Use same domain - Nginx routes /api/ to backend
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}`;
  }

  // Fallback to environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return 'http://localhost:5000';
};

const API_URL = getApiUrl();

// Services API
export const servicesApi = {
  async getAll() {
    const res = await fetch(`${API_URL}/api/services`);
    if (!res.ok) throw new Error('Failed to fetch services');
    return res.json();
  },

  async getOne(id: string) {
    const res = await fetch(`${API_URL}/api/services/${id}`);
    if (!res.ok) throw new Error('Failed to fetch service');
    return res.json();
  },

  async create(service: any) {
    // Convert camelCase to snake_case for backend
    const payload = {
      name: service.name,
      description: service.description,
      url: service.url,
      category_id: service.categoryId,
      tags: service.tags,
      icon: service.icon,
      custom_image: service.customImage,
      is_favorite: service.isFavorite,
      status: service.status,
      open_in_new_tab: service.openInNewTab,
      is_visible: service.isVisible,
      order: service.order,
      stats: service.stats,
    };
    const res = await fetch(`${API_URL}/api/services`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create service');
    return res.json();
  },

  async update(id: string, service: any) {
    // Convert camelCase to snake_case for backend
    const payload = {
      name: service.name,
      description: service.description,
      url: service.url,
      category_id: service.categoryId,
      tags: service.tags,
      icon: service.icon,
      custom_image: service.customImage,
      is_favorite: service.isFavorite,
      status: service.status,
      open_in_new_tab: service.openInNewTab,
      is_visible: service.isVisible,
      order: service.order,
      stats: service.stats,
    };
    const res = await fetch(`${API_URL}/api/services/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update service');
    return res.json();
  },

  async delete(id: string) {
    const res = await fetch(`${API_URL}/api/services/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete service');
    return res.json();
  },

  /** Brings a deleted link back as it was (from its history line). */
  async restore(id: string) {
    const res = await fetch(`${API_URL}/api/services/${id}/restore`, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Restauration impossible');
    return body;
  },

  async logAccess(id: string) {
    const res = await fetch(`${API_URL}/api/services/${id}/access`, {
      method: 'POST',
    });
    if (!res.ok) console.error('Failed to log access');
    return res.json();
  },

  /** Bulk order/folder update: [{ id, category_id, order }]. */
  async reorder(items: { id: string; category_id?: string; order: number }[]) {
    const res = await fetch(`${API_URL}/api/services/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error('Failed to reorder services');
    return res.json();
  },

  async getLiveStatus() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const res = await fetch(`${API_URL}/api/services/live-status`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Failed to fetch live status');
      return res.json();
    } catch (error) {
      // Return empty object on timeout or error
      return {};
    }
  },

  /** Recently opened links and 30-day usage counts. */
  async getRecent(): Promise<{ recent: { id: string; at: string }[]; usage: Record<string, number> }> {
    const res = await fetch(`${API_URL}/api/services/recent`);
    if (!res.ok) throw new Error('Failed to fetch recent');
    return res.json();
  },

  /** Status, latency and recent history per service (backend health monitor). */
  async getHealth(): Promise<Record<string, ServiceHealth>> {
    const res = await fetch(`${API_URL}/api/services/health`);
    if (!res.ok) throw new Error('Failed to fetch health');
    return res.json();
  },
};

// Categories API
export const categoriesApi = {
  async getAll() {
    const res = await fetch(`${API_URL}/api/categories`);
    if (!res.ok) throw new Error('Failed to fetch categories');
    return res.json();
  },

  async getOne(id: string) {
    const res = await fetch(`${API_URL}/api/categories/${id}`);
    if (!res.ok) throw new Error('Failed to fetch category');
    return res.json();
  },

  async create(category: any) {
    const res = await fetch(`${API_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    });
    if (!res.ok) throw new Error('Failed to create category');
    return res.json();
  },

  async update(id: string, category: any) {
    const res = await fetch(`${API_URL}/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    });
    if (!res.ok) throw new Error('Failed to update category');
    return res.json();
  },

  async reorder(items: { id: string; order: number }[]) {
    const res = await fetch(`${API_URL}/api/categories/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error('Failed to reorder categories');
    return res.json();
  },

  async delete(id: string) {
    const res = await fetch(`${API_URL}/api/categories/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete category');
    return res.json();
  },
};

export interface LinkPreview {
  url: string;
  title: string;
  description: string | null;
  icon: string | null;
  reachable: boolean;
  /** Set for github.com/<owner>/<repo> links. */
  github?: { owner: string; repo: string };
}

// Links API: what the quick-add dialog reads from a pasted URL.
export const linksApi = {
  async preview(url: string, signal?: AbortSignal): Promise<LinkPreview> {
    const res = await fetch(`${API_URL}/api/links/preview?url=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) throw new Error('URL invalide');
    return res.json();
  },
  /** Dead links of the last check, by service id. */
  async dead(): Promise<Record<string, { reason: string; checkedAt: string }>> {
    const res = await fetch(`${API_URL}/api/links/dead`);
    if (!res.ok) return {};
    return res.json();
  },
  /** Last link check report (null before the first one). */
  async lastCheck(): Promise<LinkCheckReport | null> {
    const res = await fetch(`${API_URL}/api/links/check`);
    if (!res.ok) return null;
    return res.json();
  },
  /** Checks every external link now: fills missing info, spots dead ones. */
  async check(): Promise<LinkCheckReport> {
    const res = await fetch(`${API_URL}/api/links/check`, { method: 'POST' });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Vérification impossible');
    return body;
  },
  /** Hover card of an external link (cached a day by the backend). */
  async card(url: string, signal?: AbortSignal): Promise<LinkCard> {
    const res = await fetch(`${API_URL}/api/links/card?url=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) throw new Error('URL invalide');
    return res.json();
  },
};

export interface LinkCheckReport {
  checkedAt: string;
  checked: number;
  filled: { id: string; name: string; changes: string[] }[];
  dead: { id: string; name: string; url: string; reason: string }[];
}

export interface LinkCard {
  image: string | null;
  description: string | null;
  title: string;
}

export type TimelineGroup = 'liens' | 'docker' | 'maison' | 'medias';
export interface TimelineEntry {
  id: string;
  at: string;
  group: TimelineGroup;
  kind: string;
  title: string;
  subject: string;
  detail?: string;
  failed?: boolean;
  /** Deleted link that can be brought back: its id. */
  restoreId?: string;
}

// Theme API
export const themeApi = {
  async get() {
    const res = await fetch(`${API_URL}/api/theme`);
    if (!res.ok) throw new Error('Failed to fetch theme');
    return res.json();
  },

  async update(theme: any) {
    // Convert camelCase to snake_case for backend
    const payload = {
      mode: theme.mode,
      primary_color: theme.primaryColor,
      background_type: theme.backgroundType,
      background_value: theme.backgroundValue,
      density: theme.density,
      show_clock: theme.showClock,
      show_weather: theme.showWeather,
      show_descriptions: theme.showDescriptions,
      show_system_stats: theme.showSystemStats,
      system_stats_position: theme.systemStatsPosition,
      system_stats_custom_position: theme.systemStatsCustomPosition,
      weather_city: theme.weatherCity,
      weather_unit: theme.weatherUnit,
      user_name: theme.userName,
      ssh_target: theme.sshTarget,
      skin: theme.skin,
    };
    const res = await fetch(`${API_URL}/api/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update theme');
    return res.json();
  },
};

/** The creature in the sidebar (backend routes/pet.ts). */
export const petApi = {
  async get(): Promise<import('./lib/pet').PetState> {
    const res = await fetch(`${API_URL}/api/pet`);
    if (!res.ok) throw new Error('Failed to fetch pet');
    return res.json();
  },
  async pet(): Promise<import('./lib/pet').PetState> {
    const res = await fetch(`${API_URL}/api/pet/pet`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to pet');
    return res.json();
  },
  async rename(name: string): Promise<import('./lib/pet').PetState> {
    const res = await fetch(`${API_URL}/api/pet`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (!res.ok) throw new Error('Failed to rename');
    return res.json();
  },
  async live(): Promise<import('./lib/pet').PetLive> {
    const res = await fetch(`${API_URL}/api/pet/live`);
    if (!res.ok) throw new Error('Failed to fetch pet live');
    return res.json();
  },
  async journal(before?: number): Promise<import('./lib/pet').PetEvent[]> {
    const res = await fetch(`${API_URL}/api/pet/journal?limit=60${before ? `&before=${before}` : ''}`);
    if (!res.ok) throw new Error('Carnet indisponible');
    return res.json();
  },
  async badges(): Promise<import('./lib/pet').PetBadge[]> {
    const res = await fetch(`${API_URL}/api/pet/badges`);
    if (!res.ok) throw new Error('Succès indisponibles');
    return res.json();
  },
  async wear(accessory: string | null): Promise<import('./lib/pet').PetState> {
    return petSend('PUT', '/accessory', { accessory });
  },
};

async function petSend(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_URL}/api/pet${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Action impossible');
  return res.json();
}

/** Containers, networks and live traffic for the infrastructure map. */
export const topologyApi = {
  async get(): Promise<import('./types').Topology> {
    const res = await fetch(`${API_URL}/api/docker/topology`);
    if (!res.ok) throw new Error('Failed to fetch topology');
    return res.json();
  },
};

/** Container updates and cleanup (backend services/updates.ts). */
export const maintenanceApi = {
  async updates(): Promise<import('./types').UpdatesData> {
    const res = await fetch(`${API_URL}/api/docker/updates`);
    if (!res.ok) throw new Error('Failed to fetch updates');
    return res.json();
  },
  async check(): Promise<import('./types').UpdatesData> {
    const res = await fetch(`${API_URL}/api/docker/updates/check`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to check updates');
    return res.json();
  },
  async update(container: string): Promise<import('./types').UpdateJob> {
    const res = await fetch(`${API_URL}/api/docker/updates/${encodeURIComponent(container)}`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Failed to start update');
    return res.json();
  },
  async prunePreview(): Promise<import('./types').PrunePreview> {
    const res = await fetch(`${API_URL}/api/docker/prune`);
    if (!res.ok) throw new Error('Failed to fetch cleanup preview');
    return res.json();
  },
  async prune(opts: { containers?: boolean; images?: 'dangling' | 'unused' | false; networks?: boolean; buildCache?: boolean; volumes?: boolean }) {
    const res = await fetch(`${API_URL}/api/docker/prune`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Cleanup failed');
    return res.json() as Promise<{ freed: Record<string, number>; removed: Record<string, number>; total: number }>;
  },
};

/** Nexus Wrapped: a month in numbers (backend routes/wrapped.ts). */
export const wrappedApi = {
  async get(month?: string): Promise<import('./types').WrappedData> {
    const res = await fetch(`${API_URL}/api/wrapped${month ? `?month=${encodeURIComponent(month)}` : ''}`);
    if (!res.ok) throw new Error('Failed to fetch the Wrapped');
    return res.json();
  },
};

/** Styles made in the Studio (backend routes/skins.ts). */
export const skinsApi = {
  async getAll(): Promise<import('./theme/skins').CustomSkin[]> {
    const res = await fetch(`${API_URL}/api/skins`);
    if (!res.ok) throw new Error('Failed to fetch skins');
    return res.json();
  },
  async save(skin: { id?: string; name: string; config: import('./theme/skins').CustomSkinConfig }): Promise<import('./theme/skins').CustomSkin> {
    const res = await fetch(`${API_URL}/api/skins${skin.id ? `/${skin.id}` : ''}`, {
      method: skin.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: skin.name, config: skin.config }),
    });
    if (!res.ok) throw new Error('Failed to save skin');
    return res.json();
  },
  async remove(id: string) {
    const res = await fetch(`${API_URL}/api/skins/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete skin');
  },
};

// Weather API
export const weatherApi = {
  async get() {
    const res = await fetch(`${API_URL}/api/weather`);
    if (!res.ok) throw new Error('Failed to fetch weather');
    return res.json();
  },
};

// Audit API
export const auditApi = {
  async getLogs(filters?: any) {
    const params = new URLSearchParams();
    if (filters?.entity_type) params.append('entity_type', filters.entity_type);
    if (filters?.entity_id) params.append('entity_id', filters.entity_id);
    if (filters?.action) params.append('action', filters.action);
    if (filters?.limit) params.append('limit', filters.limit);
    if (filters?.offset) params.append('offset', filters.offset);

    const res = await fetch(`${API_URL}/api/audit/logs?${params}`);
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return res.json();
  },

  async getLog(id: string) {
    const res = await fetch(`${API_URL}/api/audit/logs/${id}`);
    if (!res.ok) throw new Error('Failed to fetch audit log');
    return res.json();
  },

  async getAccessLogs(serviceId: string, limit?: number) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());

    const res = await fetch(`${API_URL}/api/audit/access/${serviceId}?${params}`);
    if (!res.ok) throw new Error('Failed to fetch access logs');
    return res.json();
  },

  /** Readable action history, newest first; `before` pages back. */
  async timeline(opts: { limit?: number; before?: string; group?: TimelineGroup; entity?: string[] } = {}): Promise<{ entries: TimelineEntry[]; more: boolean }> {
    const params = new URLSearchParams();
    if (opts.entity?.length) params.set('entity', opts.entity.join(','));
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.before) params.set('before', opts.before);
    if (opts.group) params.set('group', opts.group);
    const res = await fetch(`${API_URL}/api/audit/timeline?${params}`);
    if (!res.ok) throw new Error("Impossible de lire l'historique");
    return res.json();
  },

  async getStats() {
    const res = await fetch(`${API_URL}/api/audit/stats`);
    if (!res.ok) throw new Error('Failed to fetch audit stats');
    return res.json();
  },
};

// Docker API
export const dockerApi = {
  async getContainers() {
    const res = await fetch(`${API_URL}/api/docker/containers`);
    if (!res.ok) throw new Error('Failed to fetch containers');
    return res.json();
  },

  async getStats(containerId: string) {
    const res = await fetch(`${API_URL}/api/docker/stats/${containerId}`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  /** Every container with CPU / RAM and an hour of history. */
  async getOverview(): Promise<ContainerOverview[]> {
    const res = await fetch(`${API_URL}/api/docker/overview`);
    if (!res.ok) throw new Error('Failed to fetch containers');
    return res.json();
  },

  /** Containers with nexus.* labels; their tiles are created on the way. */
  async getDiscovered() {
    const res = await fetch(`${API_URL}/api/docker/discovered`);
    if (!res.ok) throw new Error('Failed to discover containers');
    return res.json();
  },

  async getAggregatedStats() {
    const res = await fetch(`${API_URL}/api/docker/stats/aggregated`);
    if (!res.ok) throw new Error('Failed to fetch aggregated stats');
    return res.json();
  },

  async getLogs(containerId: string, lines = 100) {
    const params = new URLSearchParams({ lines: lines.toString() });
    const res = await fetch(`${API_URL}/api/docker/logs/${containerId}?${params}`);
    if (!res.ok) throw new Error('Failed to fetch logs');
    return res.json();
  },

  async restartContainer(containerId: string) {
    const res = await fetch(`${API_URL}/api/docker/${containerId}/restart`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to restart container');
    return res.json();
  },

  async stopContainer(containerId: string) {
    const res = await fetch(`${API_URL}/api/docker/${containerId}/stop`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to stop container');
    return res.json();
  },

  async startContainer(containerId: string) {
    const res = await fetch(`${API_URL}/api/docker/${containerId}/start`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to start container');
    return res.json();
  },
};

// Integrations (live tile widgets)
export const integrationsApi = {
  async getWidgets(): Promise<Record<string, Widget>> {
    const res = await fetch(`${API_URL}/api/integrations/widgets`);
    if (!res.ok) throw new Error('Failed to fetch widgets');
    return res.json();
  },
  async getAll(): Promise<IntegrationConfig[]> {
    const res = await fetch(`${API_URL}/api/integrations`);
    if (!res.ok) throw new Error('Failed to fetch integrations');
    return res.json();
  },
  async save(type: string, body: Record<string, unknown>): Promise<{ ok: boolean; summary?: string; error?: string }> {
    const res = await fetch(`${API_URL}/api/integrations/${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('Failed to save integration');
    return res.json();
  },
  async remove(type: string) {
    const res = await fetch(`${API_URL}/api/integrations/${type}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to remove integration');
    return res.json();
  },
  /** Every Home Assistant entity with its room, and the ones pinned on the tile. */
  async haEntities(): Promise<{ pinned: string[]; entities: import('./types').HaEntity[] }> {
    const res = await fetch(`${API_URL}/api/integrations/homeassistant/entities`);
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Home Assistant indisponible');
    return res.json();
  },
  async haPin(entities: string[]): Promise<{ ok: boolean; summary?: string; error?: string }> {
    const res = await fetch(`${API_URL}/api/integrations/homeassistant/pinned`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entities }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Enregistrement impossible');
    return res.json();
  },
  /** One folder level of Nextcloud (open = path) or kDrive (open = folder id). */
  async storageTree(store: 'nextcloud' | 'kdrive', open: string): Promise<import('./types').TreeItem[]> {
    const q = store === 'nextcloud' ? `path=${encodeURIComponent(open)}` : `dir=${encodeURIComponent(open)}`;
    const res = await fetch(`${API_URL}/api/integrations/${store}/tree?${q}`);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Lecture impossible');
    return body;
  },
  /** Search by name anywhere in Nextcloud or kDrive (page Fichiers); each hit knows its folder. */
  async storageFind(store: 'nextcloud' | 'kdrive', q: string, signal?: AbortSignal): Promise<import('./types').TreeItem[]> {
    const res = await fetch(`${API_URL}/api/integrations/${store}/find?q=${encodeURIComponent(q)}`, { signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Recherche impossible');
    return body;
  },
  /** New folder in `target` (Nextcloud path or kDrive id); returns what opens it. */
  async createFolder(store: 'nextcloud' | 'kdrive', target: string, name: string): Promise<{ open: string; name: string }> {
    const res = await fetch(`${API_URL}/api/integrations/${store}/folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, name }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Création impossible');
    return body;
  },
  /** Sends a file into a Nextcloud folder (target = path) or a kDrive one (target = id); progress 0-1. */
  uploadToStore(store: 'nextcloud' | 'kdrive', target: string, file: File, onProgress?: (p: number) => void): Promise<{ name: string }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/integrations/${store}/upload?name=${encodeURIComponent(file.name)}&target=${encodeURIComponent(target)}`);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let body: any = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // An HTML error page (e.g. Cloudflare's 413).
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body?.error ?? (xhr.status === 413 ? 'Fichier trop gros (100 Mo au maximum)' : `Envoi impossible (HTTP ${xhr.status})`)));
      };
      xhr.onerror = () => reject(new Error('Envoi interrompu'));
      xhr.send(file);
    });
  },
  /** Files on kDrive (empty when it isn't configured). */
  async kdriveSearch(q: string, signal?: AbortSignal): Promise<import('./types').NcFile[]> {
    const res = await fetch(`${API_URL}/api/integrations/kdrive/search?q=${encodeURIComponent(q)}`, { signal });
    if (res.status === 409) return [];
    if (!res.ok) throw new Error('Recherche kDrive impossible');
    return res.json();
  },
  /** Files on Nextcloud (empty when it isn't configured or has no app password). */
  async ncSearch(q: string, signal?: AbortSignal): Promise<import('./types').NcFile[]> {
    const res = await fetch(`${API_URL}/api/integrations/nextcloud/search?q=${encodeURIComponent(q)}`, { signal });
    if (res.status === 409) return [];
    if (!res.ok) throw new Error('Recherche Nextcloud impossible');
    return res.json();
  },
  /** Starts an `occ` action in the Nextcloud container (runs in the background). */
  async ncAction(action: import('./types').NcAction): Promise<void> {
    const res = await fetch(`${API_URL}/api/integrations/nextcloud/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Action impossible');
  },
  async ncActionState(): Promise<{ label: string; status: 'running' | 'done' | 'failed'; output: string } | null> {
    const res = await fetch(`${API_URL}/api/integrations/nextcloud/action`);
    if (!res.ok) return null;
    return res.json();
  },
  /** Films and series on Jellyseerr (empty when it isn't configured). */
  async seerrSearch(q: string, signal?: AbortSignal): Promise<import('./types').SeerrResult[]> {
    const res = await fetch(`${API_URL}/api/integrations/jellyseerr/search?q=${encodeURIComponent(q)}`, { signal });
    if (res.status === 409) return [];
    if (!res.ok) throw new Error('Recherche Jellyseerr impossible');
    return res.json();
  },
  async seerrRequest(mediaType: 'movie' | 'tv', mediaId: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/integrations/jellyseerr/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaType, mediaId }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Demande impossible');
  },
};

// Web search through SearXNG (backend routes/search.ts); empty when it can't be reached.
export const searchApi = {
  async web(q: string, signal?: AbortSignal): Promise<{ title: string; url: string; content: string }[]> {
    const res = await fetch(`${API_URL}/api/search/web?q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) return [];
    return res.json();
  },
};

// Home Assistant widgets (backend routes/ha.ts)
export const haApi = {
  async widgets(): Promise<import('./types').HaWidgetsData> {
    const res = await fetch(`${API_URL}/api/ha/widgets`);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Home Assistant indisponible');
    return body;
  },
  async create(w: Partial<import('./types').HaWidget>): Promise<import('./types').HaWidget> {
    const res = await fetch(`${API_URL}/api/ha/widgets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Création impossible');
    return body;
  },
  async update(id: number, w: Partial<import('./types').HaWidget>): Promise<import('./types').HaWidget> {
    const res = await fetch(`${API_URL}/api/ha/widgets/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Enregistrement impossible');
    return body;
  },
  async remove(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/ha/widgets/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Suppression impossible');
  },
  async order(ids: number[]): Promise<void> {
    const res = await fetch(`${API_URL}/api/ha/widgets/order`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    if (!res.ok) throw new Error('Ordre non enregistré');
  },
  /** Entities shown in the status bar instead of the city weather (none: the weather stays). */
  async statusbar(): Promise<import('./types').HaBarItem[]> {
    const res = await fetch(`${API_URL}/api/ha/statusbar`);
    if (!res.ok) return [];
    return (await res.json()).entities ?? [];
  },
  async setStatusbar(entities: string[]): Promise<void> {
    const res = await fetch(`${API_URL}/api/ha/statusbar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entities }) });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Enregistrement impossible');
  },
  /** `extra` for lights with action "set": brightness (1-100), rgb, kelvin. */
  async control(entityId: string, action: string, extra: { brightness?: number; rgb?: [number, number, number]; kelvin?: number } = {}): Promise<{ state: string }> {
    const res = await fetch(`${API_URL}/api/ha/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId, action, ...extra }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error ?? 'Commande impossible');
    return body;
  },
};

// System API
export const systemApi = {
  async getStats() {
    const res = await fetch(`${API_URL}/api/system/stats`);
    if (!res.ok) throw new Error('Failed to fetch system stats');
    return res.json();
  },
};

// Jellyfin API
export const jellyfinApi = {
  async getUsers() {
    const res = await fetch(`${API_URL}/api/jellyfin/users`);
    if (!res.ok) throw new Error('Failed to fetch Jellyfin users');
    return res.json();
  },

  async getAllStats() {
    const res = await fetch(`${API_URL}/api/jellyfin/stats`);
    if (!res.ok) throw new Error('Failed to fetch Jellyfin stats');
    return res.json();
  },

  async getUserStats(userId: string) {
    const res = await fetch(`${API_URL}/api/jellyfin/stats/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch user Jellyfin stats');
    return res.json();
  },

  async getGlobalStats() {
    const res = await fetch(`${API_URL}/api/jellyfin/global-stats`);
    if (!res.ok) throw new Error('Failed to fetch global Jellyfin stats');
    return res.json();
  },

  async getConfig() {
    const res = await fetch(`${API_URL}/api/jellyfin/config`);
    if (!res.ok) throw new Error('Failed to fetch Jellyfin config');
    return res.json();
  },

  async getSharedMedia() {
    const res = await fetch(`${API_URL}/api/jellyfin/shared-media`);
    if (!res.ok) throw new Error('Failed to fetch shared media');
    return res.json();
  },

  async getActivityStats() {
    const res = await fetch(`${API_URL}/api/jellyfin/activity`);
    if (!res.ok) throw new Error('Failed to fetch activity stats');
    return res.json();
  },

  async getUserGenres(userId: string) {
    const res = await fetch(`${API_URL}/api/jellyfin/genres/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch user genres');
    return res.json();
  },

  async getCollaborativeRecommendations(userId: string) {
    const res = await fetch(`${API_URL}/api/jellyfin/recommendations/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch recommendations');
    return res.json();
  },
};

export default {
  services: servicesApi,
  categories: categoriesApi,
  theme: themeApi,
  audit: auditApi,
  weather: weatherApi,
  docker: dockerApi,
  system: systemApi,
  jellyfin: jellyfinApi,
};

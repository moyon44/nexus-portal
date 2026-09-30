import { Router, Request, Response } from 'express';
import db from '../db.js';
import { NC_ACTIONS, lastAction, runAction, type NcAction } from '../services/nextcloud.js';

/**
 * Live tile widgets, Homepage style: a short line of real data on the tile of
 * qBittorrent (speeds), Jellyfin (now playing), Sonarr / Radarr (today's
 * releases, queue), Jellyseerr (requests waiting for approval), Nextcloud
 * (free space, activity, a pending upgrade) and Home Assistant (a few sensors).
 *
 * Credentials live in the `integrations` table and never leave the backend:
 * the API only says whether a key is set. A poller refreshes every widget
 * every POLL_INTERVAL; clients read the cache (GET /api/integrations/widgets).
 */

const router = Router();
const POLL_INTERVAL = 20_000;
const TIMEOUT = 6_000;

export const TYPES = ['qbittorrent', 'jellyfin', 'sonarr', 'radarr', 'jellyseerr', 'nextcloud', 'kdrive', 'homeassistant'] as const;
type IntegrationType = (typeof TYPES)[number];

interface IntegrationRow {
  type: IntegrationType;
  enabled: boolean;
  service_id: string | null;
  url: string | null;
  api_key: string | null;
  username: string | null;
  password: string | null;
  options: any;
}

export interface Widget {
  type: IntegrationType;
  serviceId: string | null;
  ok: boolean;
  /** One short line for the tile. */
  summary: string;
  /** Details for the tooltip. */
  items: string[];
  /** Something is happening right now (playback, downloads, queue): the tile glows. */
  active?: boolean;
  error?: string;
  at: number;
}

const widgets = new Map<IntegrationType, Widget>();

/* ----- Helpers ------------------------------------------------------------ */

const base = (url: string) => url.replace(/\/+$/, '');

async function getJson(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function speed(bytesPerSecond: number) {
  const units = ['o/s', 'Ko/s', 'Mo/s', 'Go/s'];
  let v = bytesPerSecond;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

function size(bytes: number) {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

/** Jellyfin 10.11+ only accepts the key in the Authorization header. */
const jellyfinAuth = (key: string) => ({ Authorization: `MediaBrowser Token="${key}"` });

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/* ----- Fetchers ------------------------------------------------------------- */

async function qbittorrent(cfg: IntegrationRow): Promise<Omit<Widget, 'type' | 'serviceId' | 'at'>> {
  const url = base(cfg.url!);
  const headers: Record<string, string> = { Referer: url };
  if (cfg.username) {
    const login = await fetch(`${url}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
      body: new URLSearchParams({ username: cfg.username, password: cfg.password ?? '' }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    // "SID" before qBittorrent 5, "QBT_SID_<port>" since.
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .find((c) => /^(QBT_)?SID(_\d+)?=/.test(c));
    if (!cookie) throw new Error(login.status === 403 ? 'IP bannie par qBittorrent (trop d’échecs)' : 'Connexion refusée');
    headers.Cookie = cookie;
  }
  const [info, downloading] = await Promise.all([
    getJson(`${url}/api/v2/transfer/info`, { headers }),
    getJson(`${url}/api/v2/torrents/info?filter=downloading`, { headers }),
  ]);
  const active = (downloading as any[]).length;
  return {
    ok: true,
    active: active > 0,
    summary: `↓ ${speed(info.dl_info_speed)} · ↑ ${speed(info.up_info_speed)}`,
    items: [
      active ? plural(active, 'téléchargement en cours', 'téléchargements en cours') : 'Aucun téléchargement',
      ...(downloading as any[]).slice(0, 5).map((t) => `${Math.round(t.progress * 100)} % · ${t.name}`),
    ],
  };
}

async function jellyfin(cfg: IntegrationRow) {
  const url = base(cfg.url!);
  const key = cfg.api_key || process.env.JELLYFIN_API_KEY || '';
  const sessions = (await getJson(`${url}/Sessions?activeWithinSeconds=600`, {
    headers: jellyfinAuth(key),
  })) as any[];
  const playing = sessions.filter((s) => s.NowPlayingItem);
  const title = (s: any) => {
    const i = s.NowPlayingItem;
    return i.SeriesName ? `${i.SeriesName} S${String(i.ParentIndexNumber ?? 0).padStart(2, '0')}E${String(i.IndexNumber ?? 0).padStart(2, '0')}` : i.Name;
  };
  return {
    ok: true,
    active: playing.length > 0,
    summary: playing.length ? `▶ ${plural(playing.length, 'lecture', 'lectures')} en cours` : 'Aucune lecture',
    items: playing.map((s) => `${s.UserName ?? '?'} · ${title(s)}${s.PlayState?.IsPaused ? ' (pause)' : ''}`),
  };
}

async function arr(cfg: IntegrationRow, kind: 'sonarr' | 'radarr') {
  const url = base(cfg.url!);
  const headers = { 'X-Api-Key': cfg.api_key ?? '' };
  const { start, end } = todayRange();
  const extra = kind === 'sonarr' ? '&includeSeries=true' : '';
  const [calendar, queue] = await Promise.all([
    getJson(`${url}/api/v3/calendar?start=${start}&end=${end}${extra}`, { headers }) as Promise<any[]>,
    getJson(`${url}/api/v3/queue?pageSize=1`, { headers }),
  ]);
  const queued = queue?.totalRecords ?? 0;
  const today =
    kind === 'sonarr'
      ? calendar.map((e) => `${e.series?.title ?? 'Série'} S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}${e.hasFile ? ' ✓' : ''}`)
      : calendar.map((m) => `${m.title}${m.hasFile ? ' ✓' : ''}`);
  const label = kind === 'sonarr' ? ['épisode', 'épisodes'] : ['film', 'films'];
  return {
    ok: true,
    active: queued > 0,
    summary: `${plural(today.length, label[0], label[1])} aujourd'hui · ${queued} en file`,
    items: today.length ? today.slice(0, 8) : ['Rien de prévu aujourd’hui'],
  };
}

// Request results carry TMDB ids only: titles are looked up once and kept.
const seerrTitles = new Map<string, string>();

async function jellyseerr(cfg: IntegrationRow) {
  const url = base(cfg.url!);
  const headers = { 'X-Api-Key': cfg.api_key ?? '' };
  const [count, pending] = await Promise.all([
    getJson(`${url}/api/v1/request/count`, { headers }),
    getJson(`${url}/api/v1/request?take=5&filter=pending&sort=added`, { headers }),
  ]);
  const title = async (m: any) => {
    const key = `${m.mediaType}:${m.tmdbId}`;
    if (!seerrTitles.has(key)) {
      const d = await getJson(`${url}/api/v1/${m.mediaType === 'tv' ? 'tv' : 'movie'}/${m.tmdbId}?language=fr`, { headers }).catch(() => null);
      if (!d) return m.mediaType === 'tv' ? 'Série' : 'Film';
      seerrTitles.set(key, d.title ?? d.name ?? '?');
    }
    return seerrTitles.get(key)!;
  };
  const waiting: number = count.pending ?? 0;
  const items = await Promise.all(
    (pending.results as any[]).map(async (r) => `${r.type === 'tv' ? '📺' : '🎬'} ${await title(r.media)} · ${r.requestedBy?.displayName ?? '?'}`),
  );
  return {
    ok: true,
    active: waiting > 0,
    summary: `${plural(waiting, 'demande', 'demandes')} en attente · ${count.processing ?? 0} en cours`,
    items: [...items, `${count.total ?? 0} demandes au total · ${count.approved ?? 0} approuvées`],
  };
}

// Status first (no credentials): a pending upgrade or maintenance mode leaves
// the site down while the container looks fine. Figures come from the
// serverinfo app (its token is the "API key").
async function nextcloud(cfg: IntegrationRow) {
  const url = base(cfg.url!);
  const status = await getJson(`${url}/status.php`);
  const action = lastAction();
  const actionLine = action
    ? [`${action.status === 'running' ? '⏳' : action.status === 'done' ? '✓' : '✗'} ${action.label}${action.status === 'failed' && action.output ? ` : ${action.output.split('\n').pop()}` : ''}`]
    : [];
  if (status.needsDbUpgrade || status.maintenance) {
    return {
      ok: true,
      active: true,
      summary: status.needsDbUpgrade ? '⚠ Mise à jour à terminer' : '⚠ Mode maintenance',
      items: [
        status.needsDbUpgrade ? `Nextcloud ${status.versionstring} attend sa mise à jour de base : Ctrl K → « Nextcloud : terminer la mise à jour »` : 'Le site est fermé aux utilisateurs',
        ...actionLine,
      ],
    };
  }
  if (!cfg.api_key) return { ok: true, summary: `Nextcloud ${status.versionstring}`, items: ['Ajoute le jeton serverinfo pour les chiffres', ...actionLine] };
  const info = await getJson(`${url}/ocs/v2.php/apps/serverinfo/api/v1/info?format=json&skipApps=false`, { headers: { 'NC-Token': cfg.api_key } });
  const d = info.ocs.data;
  const nc = d.nextcloud;
  const today = d.activeUsers?.last24hours ?? 0;
  const updates = nc.system.apps?.num_updates_available ?? 0;
  const openLinks = nc.shares?.num_shares_link_no_password ?? 0;
  return {
    ok: true,
    summary: `${size(nc.system.freespace ?? 0)} libres · ${plural(today, 'actif', 'actifs')} aujourd’hui`,
    items: [
      `${plural(nc.storage.num_users, 'utilisateur', 'utilisateurs')} · ${nc.storage.num_files.toLocaleString('fr-FR')} fichiers`,
      `${plural(nc.shares.num_shares, 'partage', 'partages')}${openLinks ? ` · ${openLinks} lien${openLinks > 1 ? 's' : ''} sans mot de passe` : ''}`,
      updates ? `${plural(updates, 'mise à jour d’app', 'mises à jour d’apps')} disponible${updates > 1 ? 's' : ''}` : 'Apps à jour',
      `Nextcloud ${status.versionstring}`,
      ...actionLine,
    ],
  };
}

// Infomaniak kDrive: public API (api.infomaniak.com), a token with the
// "drive" scope as the key, the drive's number in options.driveId. The API
// allows 60 requests a minute: the tile costs one every POLL_INTERVAL.
const KDRIVE_API = 'https://api.infomaniak.com';

function kdriveId(cfg: IntegrationRow): number {
  const id = Number(String(cfg.options?.driveId ?? '').trim());
  if (!Number.isInteger(id) || id <= 0) throw new Error('Numéro du kDrive manquant (le nombre après /drive/ dans son adresse)');
  return id;
}

async function kdriveJson(cfg: IntegrationRow, path: string) {
  const body = await getJson(`${KDRIVE_API}${path}`, { headers: { Authorization: `Bearer ${cfg.api_key ?? ''}` } });
  if (body?.result !== 'success') throw new Error(body?.error?.description ?? 'Réponse kDrive inattendue');
  return body.data;
}

// The web app lives under the account: ksuite.infomaniak.com/<account>/kdrive/app/drive/<drive>/…
const kdriveAccount = new Map<number, number>();

async function kdriveWeb(cfg: IntegrationRow, id: number) {
  if (!kdriveAccount.has(id)) {
    const drive = await kdriveJson(cfg, `/2/drive/${id}`);
    if (drive.account_id) kdriveAccount.set(id, drive.account_id);
  }
  const account = kdriveAccount.get(id);
  return account ? `https://ksuite.infomaniak.com/${account}/kdrive/app/drive/${id}` : `https://kdrive.infomaniak.com/app/drive/${id}`;
}

async function kdrive(cfg: IntegrationRow) {
  const drive = await kdriveJson(cfg, `/2/drive/${kdriveId(cfg)}`);
  if (drive.account_id) kdriveAccount.set(drive.id ?? kdriveId(cfg), drive.account_id);
  const used = drive.used_size ?? 0;
  const total = drive.size ?? 0;
  const pct = total ? Math.round((used / total) * 100) : 0;
  return {
    ok: true,
    summary: total ? `${size(Math.max(0, total - used))} libres · ${pct} % utilisés` : `${size(used)} utilisés`,
    items: [drive.name ?? 'kDrive', total ? `${size(used)} sur ${size(total)}` : `${size(used)} utilisés`],
  };
}

async function homeassistant(cfg: IntegrationRow) {
  const url = base(cfg.url!);
  const entities: string[] = String(cfg.options?.entities ?? '')
    .split(',')
    .map((e: string) => e.trim())
    .filter(Boolean);
  const headers = { Authorization: `Bearer ${cfg.api_key ?? ''}` };
  // Nothing pinned yet: who's home and how many sensors answer.
  if (!entities.length) {
    const all = (await getJson(`${url}/api/states`, { headers })) as any[];
    const home = all.filter((s) => s.entity_id.startsWith('person.') && s.state === 'home').map((s) => s.attributes?.friendly_name ?? s.entity_id);
    const sensors = all.filter((s) => s.entity_id.startsWith('sensor.'));
    const live = sensors.filter((s) => !['unavailable', 'unknown'].includes(s.state)).length;
    return {
      ok: true,
      summary: home.length ? `🏠 ${home.join(', ')}` : 'Personne à la maison',
      items: [`${live} capteurs actifs sur ${sensors.length}`, 'Épingle des capteurs : Système → Home Assistant'],
    };
  }
  const states = await Promise.all(entities.map((e) => getJson(`${url}/api/states/${e}`, { headers })));
  const fmt = (s: any) => {
    const n = Number(s.state);
    const value = Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : s.state;
    const unit = s.attributes?.unit_of_measurement;
    return unit ? `${value}${unit === '%' ? ' %' : ` ${unit}`}` : value;
  };
  return {
    ok: true,
    summary: states.slice(0, 3).map(fmt).join(' · '),
    items: states.map((s) => `${s.attributes?.friendly_name ?? s.entity_id} : ${fmt(s)}`),
  };
}

const FETCHERS: Record<IntegrationType, (cfg: IntegrationRow) => Promise<Omit<Widget, 'type' | 'serviceId' | 'at'>>> = {
  qbittorrent,
  jellyfin,
  sonarr: (c) => arr(c, 'sonarr'),
  radarr: (c) => arr(c, 'radarr'),
  jellyseerr,
  nextcloud,
  kdrive,
  homeassistant,
};

/* ----- Tile matching -------------------------------------------------------- */

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/** The tile a widget shows on: the chosen one, else the first whose name matches. */
async function serviceFor(cfg: IntegrationRow): Promise<string | null> {
  if (cfg.service_id) return cfg.service_id;
  const services = await db('services').select('id', 'name', 'url', 'order').where('is_visible', true).orderBy('order');
  const match = services.filter((s: any) => slug(s.name).includes(cfg.type));
  // Prefer a local address (e.g. Jellyfin on 192.168.x) when two tiles match.
  return match.find((s: any) => /\/\/(\d{1,3}\.){3}\d{1,3}/.test(s.url))?.id ?? match[0]?.id ?? null;
}

function explain(e: any): string {
  if (e?.name === 'TimeoutError') return 'Délai dépassé : adresse injoignable depuis le serveur';
  const msg: string = e?.message ?? 'Erreur';
  if (msg === 'HTTP 401') return 'Clé ou jeton refusé (HTTP 401)';
  if (msg === 'HTTP 403') return 'Accès refusé : identifiants requis ou IP bloquée (HTTP 403)';
  if (msg === 'HTTP 404') return 'API introuvable à cette adresse (HTTP 404)';
  if (/required permissions/i.test(msg)) return 'Pas autorisé à cet endroit (à la racine du kDrive, ouvre d’abord un dossier comme Private)';
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(msg + (e?.cause?.code ?? ''))) return 'Connexion impossible à cette adresse';
  return msg;
}

async function refreshOne(cfg: IntegrationRow) {
  const serviceId = await serviceFor(cfg);
  try {
    const result = await FETCHERS[cfg.type](cfg);
    widgets.set(cfg.type, { type: cfg.type, serviceId, at: Date.now(), ...result });
  } catch (e: any) {
    widgets.set(cfg.type, {
      type: cfg.type,
      serviceId,
      ok: false,
      summary: '',
      items: [],
      error: explain(e),
      at: Date.now(),
    });
  }
}

async function refreshAll() {
  const rows: IntegrationRow[] = await db('integrations').select('*');
  const active = rows.filter((r) => r.enabled && r.url);
  for (const type of widgets.keys()) if (!active.some((r) => r.type === type)) widgets.delete(type);
  await Promise.all(active.map(refreshOne));
}

export function startWidgets() {
  refreshAll().catch(() => undefined);
  setInterval(() => refreshAll().catch((e) => console.error('Widgets error:', e.message)), POLL_INTERVAL);
}

/* ----- Routes ------------------------------------------------------------------ */

// Widgets keyed by the tile (service id) they belong to.
router.get('/widgets', (req: Request, res: Response) => {
  const out: Record<string, Widget> = {};
  for (const w of widgets.values()) if (w.serviceId && w.ok) out[w.serviceId] = w;
  res.json(out);
});

// Configuration without secrets.
router.get('/', async (req: Request, res: Response) => {
  const rows: IntegrationRow[] = await db('integrations').select('*');
  res.json(
    TYPES.map((type) => {
      const r = rows.find((row) => row.type === type);
      const w = widgets.get(type);
      return {
        type,
        configured: !!r,
        enabled: r?.enabled ?? false,
        serviceId: r?.service_id ?? null,
        url: r?.url ?? '',
        username: r?.username ?? '',
        hasApiKey: !!r?.api_key || (type === 'jellyfin' && !!process.env.JELLYFIN_API_KEY),
        hasPassword: !!r?.password,
        options: r?.options ?? {},
        state: w ? { ok: w.ok, summary: w.summary, error: w.error, at: w.at } : null,
      };
    }),
  );
});

// Upsert; an empty secret keeps the stored one, `null` clears it.
router.put('/:type', async (req: Request, res: Response) => {
  const type = req.params.type as IntegrationType;
  if (!TYPES.includes(type)) {
    res.status(404).json({ error: 'Unknown integration' });
    return;
  }
  const { enabled, serviceId, url, apiKey, username, password, options } = req.body ?? {};
  // Options set elsewhere (Home Assistant's status bar choice) survive a save from Admin.
  const previous = await db('integrations').where({ type }).first('options');
  const row: Record<string, unknown> = {
    type,
    enabled: enabled !== false,
    service_id: serviceId || null,
    url: typeof url === 'string' ? url.trim() || null : null,
    username: typeof username === 'string' ? username.trim() || null : null,
    options: JSON.stringify({ ...(previous?.options ?? {}), ...(options ?? {}) }),
    updated_at: new Date(),
  };
  if (typeof apiKey === 'string' && apiKey) row.api_key = apiKey.trim();
  if (apiKey === null) row.api_key = null;
  if (typeof password === 'string' && password) row.password = password;
  if (password === null) row.password = null;

  await db('integrations').insert(row).onConflict('type').merge();
  const saved: IntegrationRow = await db('integrations').where({ type }).first();
  if (saved.enabled && saved.url) await refreshOne(saved);
  else widgets.delete(type);
  const w = widgets.get(type);
  res.json({ ok: w?.ok ?? false, summary: w?.summary, error: w?.error });
});

/* ----- Jellyseerr requests (Ctrl K → "Demandes") ----------------------------- */

async function seerrConfig(res: Response): Promise<IntegrationRow | null> {
  const cfg: IntegrationRow | undefined = await db('integrations').where({ type: 'jellyseerr' }).first();
  if (!cfg?.enabled || !cfg.url || !cfg.api_key) {
    res.status(409).json({ error: 'Jellyseerr n’est pas configuré (Admin → Intégrations)' });
    return null;
  }
  return cfg;
}

// Jellyseerr's media status: 2 pending, 3 processing, 4 partly available, 5 available.
const SEERR_STATUS: Record<number, string> = { 2: 'requested', 3: 'requested', 4: 'partial', 5: 'available' };

router.get('/jellyseerr/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const cfg = await seerrConfig(res);
  if (!cfg) return;
  try {
    // Jellyseerr rejects some characters left raw by encodeURIComponent.
    const query = encodeURIComponent(q).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const data = await getJson(`${base(cfg.url!)}/api/v1/search?query=${query}&page=1&language=fr`, {
      headers: { 'X-Api-Key': cfg.api_key! },
    });
    res.json(
      (data.results as any[])
        .filter((r) => r.mediaType === 'movie' || r.mediaType === 'tv')
        .slice(0, 6)
        .map((r) => ({
          id: r.id,
          mediaType: r.mediaType,
          title: r.title ?? r.name ?? '?',
          year: String(r.releaseDate ?? r.firstAirDate ?? '').slice(0, 4) || null,
          poster: r.posterPath ? `https://image.tmdb.org/t/p/w92${r.posterPath}` : null,
          status: SEERR_STATUS[r.mediaInfo?.status] ?? 'none',
        })),
    );
  } catch (e: any) {
    res.status(502).json({ error: explain(e) });
  }
});

// Made with the API key, so it counts as the Jellyseerr admin's request (approved at once).
router.post('/jellyseerr/request', async (req: Request, res: Response) => {
  const { mediaType, mediaId } = req.body ?? {};
  if ((mediaType !== 'movie' && mediaType !== 'tv') || !Number.isInteger(mediaId)) {
    res.status(400).json({ error: 'mediaType et mediaId requis' });
    return;
  }
  const cfg = await seerrConfig(res);
  if (!cfg) return;
  try {
    // With the API key Jellyseerr accepts duplicates: check first. A series
    // partly available can still be asked for the rest.
    const media = await getJson(`${base(cfg.url!)}/api/v1/${mediaType}/${mediaId}`, { headers: { 'X-Api-Key': cfg.api_key! } });
    const status = SEERR_STATUS[media.mediaInfo?.status];
    if (status === 'requested' || status === 'available') {
      res.status(409).json({ error: status === 'available' ? 'Déjà disponible' : 'Déjà demandé' });
      return;
    }
    const r = await fetch(`${base(cfg.url!)}/api/v1/request`, {
      method: 'POST',
      headers: { 'X-Api-Key': cfg.api_key!, 'Content-Type': 'application/json' },
      body: JSON.stringify(mediaType === 'tv' ? { mediaType, mediaId, seasons: 'all' } : { mediaType, mediaId }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) {
      const body: any = await r.json().catch(() => null);
      res.status(r.status === 409 ? 409 : 502).json({ error: r.status === 409 ? 'Déjà demandé' : body?.message ?? `HTTP ${r.status}` });
      return;
    }
    const request: any = await r.json();
    refreshOne(cfg).catch(() => undefined);
    res.json({ ok: true, status: request.status });
  } catch (e: any) {
    res.status(502).json({ error: explain(e) });
  }
});

/* ----- Home Assistant: every entity with its room (Système → Home Assistant) --- */

let haAreas: { at: number; map: Record<string, string> } = { at: 0, map: {} };
const AREAS_TEMPLATE =
  '{%- set ns = namespace(o={}) -%}{%- for s in states -%}{%- set a = area_name(s.entity_id) -%}' +
  '{%- if a -%}{%- set ns.o = dict(ns.o, **{s.entity_id: a}) -%}{%- endif -%}{%- endfor -%}{{ ns.o | tojson }}';

async function haConfig(res: Response): Promise<IntegrationRow | null> {
  const cfg: IntegrationRow | undefined = await db('integrations').where({ type: 'homeassistant' }).first();
  if (!cfg?.enabled || !cfg.url || !cfg.api_key) {
    res.status(409).json({ error: 'Home Assistant n’est pas configuré (Admin → Intégrations)' });
    return null;
  }
  return cfg;
}

router.get('/homeassistant/entities', async (req: Request, res: Response) => {
  const cfg = await haConfig(res);
  if (!cfg) return;
  const url = base(cfg.url!);
  const headers = { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' };
  try {
    const states = (await getJson(`${url}/api/states`, { headers })) as any[];
    // Rooms only come through a template; they rarely change, so kept 5 min.
    if (Date.now() - haAreas.at > 5 * 60_000) {
      const r = await fetch(`${url}/api/template`, { method: 'POST', headers, body: JSON.stringify({ template: AREAS_TEMPLATE }), signal: AbortSignal.timeout(TIMEOUT) });
      if (r.ok) haAreas = { at: Date.now(), map: (await r.json()) as Record<string, string> };
    }
    const pinned = String(cfg.options?.entities ?? '').split(',').map((e) => e.trim()).filter(Boolean);
    res.json({
      pinned,
      entities: states.map((s) => ({
        id: s.entity_id,
        domain: s.entity_id.split('.')[0],
        name: s.attributes?.friendly_name ?? s.entity_id,
        state: s.state,
        unit: s.attributes?.unit_of_measurement ?? null,
        deviceClass: s.attributes?.device_class ?? null,
        area: haAreas.map[s.entity_id] ?? null,
        changed: s.last_changed,
      })),
    });
  } catch (e: any) {
    res.status(502).json({ error: explain(e) });
  }
});

// The entities shown on the tile, in order.
router.put('/homeassistant/pinned', async (req: Request, res: Response) => {
  const list = req.body?.entities;
  if (!Array.isArray(list) || list.some((e) => typeof e !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(e))) {
    res.status(400).json({ error: 'Liste d’entités invalide' });
    return;
  }
  const cfg = await haConfig(res);
  if (!cfg) return;
  const options = { ...(cfg.options ?? {}), entities: list.join(', ') };
  await db('integrations').where({ type: 'homeassistant' }).update({ options: JSON.stringify(options), updated_at: new Date() });
  await refreshOne({ ...cfg, options });
  const w = widgets.get('homeassistant');
  res.json({ ok: w?.ok ?? false, summary: w?.summary, error: w?.error });
});

/* ----- Storage: Nextcloud and kDrive folders (sidebar → Stockage, page Fichiers) -- */

interface TreeItem {
  name: string;
  /** Nextcloud: the folder's path; kDrive: the folder's id. Files: null. */
  open: string | null;
  folder: boolean;
  size: number | null;
  /** Last change, ms since epoch. */
  modified: number | null;
  /** The containing folder, same form as `open` (search results jump there). */
  parent: string | null;
  /** Full path for display. */
  path: string;
  url: string;
}

const byFolderThenName = (a: TreeItem, b: TreeItem) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, 'fr', { numeric: true });

const cleanName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 200);

/** "/a/../b//c" → "/b/c": the only paths Nextcloud routes accept from the browser. */
const cleanPath = (p: string) => '/' + String(p ?? '/').split('/').filter((x) => x && x !== '..' && x !== '.').join('/');
const encodePath = (p: string) => (p === '/' ? '' : p.split('/').map(encodeURIComponent).join('/'));
const parentOf = (p: string) => cleanPath(p.split('/').slice(0, -1).join('/'));

// ---- Nextcloud: WebDAV as the app-password user --------------------------------

const ncDavUser = new Map<string, string>();
const DAV_PROPS = '<d:resourcetype/><d:getcontentlength/><d:getlastmodified/><oc:fileid/><oc:size/>';
const xmlText = (x: string) => x.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const xmlEscape = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface NcDav {
  url: string;
  auth: string;
  user: string;
  /** "/remote.php/dav/files/<user>" */
  root: string;
  publicBase: string;
}

async function ncDav(cfg: IntegrationRow | undefined): Promise<NcDav> {
  if (!cfg?.enabled || !cfg.url || !cfg.username || !cfg.password) throw new Error('Nextcloud : mot de passe d’application manquant (Admin → Intégrations)');
  const url = base(cfg.url);
  const auth = `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
  if (!ncDavUser.has(cfg.username)) {
    const me = await getJson(`${url}/ocs/v1.php/cloud/user?format=json`, { headers: { Authorization: auth, 'OCS-APIRequest': 'true' } });
    ncDavUser.set(cfg.username, me.ocs.data.id);
  }
  const user = ncDavUser.get(cfg.username)!;
  const serviceId = await serviceFor(cfg);
  const tile = serviceId ? await db('services').where({ id: serviceId }).first('url') : null;
  return { url, auth, user, root: `/remote.php/dav/files/${encodeURIComponent(user)}`, publicBase: tile?.url ? base(tile.url) : url };
}

/** The <d:response> blocks of a multistatus, as items (paths relative to the user's root). */
function ncItems(dav: NcDav, xml: string, skip?: string): TreeItem[] {
  const items: TreeItem[] = [];
  const rootPath = decodeURIComponent(dav.root);
  for (const block of xml.split('<d:response>').slice(1)) {
    const href = decodeURIComponent(xmlText(/<d:href>([^<]*)<\/d:href>/.exec(block)?.[1] ?? ''));
    const rel = cleanPath(href.slice(href.indexOf(rootPath) + rootPath.length));
    if (skip !== undefined && rel === skip) continue; // the folder itself
    const folder = /<d:collection\s*\/>/.test(block);
    const id = /<oc:fileid>(\d+)<\/oc:fileid>/.exec(block)?.[1];
    const bytes = Number(/<(?:oc:size|d:getcontentlength)>(\d+)</.exec(block)?.[1] ?? NaN);
    const when = Date.parse(/<d:getlastmodified>([^<]+)</.exec(block)?.[1] ?? '');
    items.push({
      name: rel.split('/').pop() || rel,
      open: folder ? rel : null,
      folder,
      size: Number.isFinite(bytes) ? bytes : null,
      modified: Number.isFinite(when) ? when : null,
      parent: parentOf(rel),
      path: rel,
      url: folder ? `${dav.publicBase}/apps/files/files/${id ?? ''}?dir=${encodeURIComponent(rel)}` : `${dav.publicBase}/f/${id}`,
    });
  }
  return items;
}

async function ncList(dav: NcDav, path: string) {
  const r = await fetch(`${dav.url}${dav.root}${encodePath(path)}${path === '/' ? '/' : '/'}`, {
    method: 'PROPFIND',
    headers: { Authorization: dav.auth, Depth: '1', 'Content-Type': 'application/xml' },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop>${DAV_PROPS}</d:prop></d:propfind>`,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (r.status !== 207) throw new Error(r.status === 404 ? 'Dossier introuvable' : `HTTP ${r.status}`);
  return ncItems(dav, await r.text(), path);
}

// WebDAV SEARCH by name, anywhere under `scope`: results keep their full path.
async function ncFind(dav: NcDav, q: string, scope = '/') {
  const body =
    `<?xml version="1.0" encoding="UTF-8"?><d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:basicsearch>` +
    `<d:select><d:prop>${DAV_PROPS}</d:prop></d:select>` +
    `<d:from><d:scope><d:href>/files/${xmlEscape(dav.user)}${xmlEscape(scope === '/' ? '' : scope)}</d:href><d:depth>infinity</d:depth></d:scope></d:from>` +
    `<d:where><d:like><d:prop><d:displayname/></d:prop><d:literal>%${xmlEscape(q.replace(/[%_]/g, ''))}%</d:literal></d:like></d:where>` +
    `<d:orderby/><d:limit><d:nresults>60</d:nresults></d:limit></d:basicsearch></d:searchrequest>`;
  const r = await fetch(`${dav.url}/remote.php/dav/`, { method: 'SEARCH', headers: { Authorization: dav.auth, 'Content-Type': 'text/xml' }, body, signal: AbortSignal.timeout(15_000) });
  if (r.status !== 207) throw new Error(`HTTP ${r.status}`);
  return ncItems(dav, await r.text());
}

// ---- kDrive -------------------------------------------------------------------------

function kdItem(f: any, web: string): TreeItem {
  const dir = f.type === 'dir';
  const secs = f.last_modified_at ?? f.updated_at ?? null;
  return {
    name: f.name,
    open: dir ? String(f.id) : null,
    folder: dir,
    size: typeof f.size === 'number' ? f.size : null,
    modified: typeof secs === 'number' ? secs * 1000 : null,
    parent: f.parent_id ? String(f.parent_id) : null,
    path: f.path ?? f.name,
    url: dir ? `${web}/files/${f.id}` : `${web}/redirect/${f.id}`,
  };
}

function kdConfig(cfg: IntegrationRow | undefined): IntegrationRow {
  if (!cfg?.enabled || !cfg.api_key) throw new Error('kDrive n’est pas configuré (Admin → Intégrations)');
  return cfg;
}

const folderId = (v: unknown) => {
  const n = Number(v ?? 1);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Dossier invalide');
  return n;
};

const storeRow = (store: string) => db('integrations').where({ type: store }).first() as Promise<IntegrationRow | undefined>;
const isStore = (s: string): s is 'nextcloud' | 'kdrive' => s === 'nextcloud' || s === 'kdrive';

// ---- Routes ---------------------------------------------------------------------------

// One folder level: ?path=/a/b (Nextcloud) or ?dir=<id> (kDrive, root 1).
router.get('/:store/tree', async (req: Request, res: Response) => {
  const store = req.params.store;
  if (!isStore(store)) {
    res.status(404).json({ error: 'Stockage inconnu' });
    return;
  }
  try {
    const cfg = await storeRow(store);
    if (store === 'nextcloud') {
      res.json((await ncList(await ncDav(cfg), cleanPath(String(req.query.path ?? '/')))).sort(byFolderThenName).slice(0, 500));
    } else {
      const c = kdConfig(cfg);
      const id = kdriveId(c);
      const files = (await kdriveJson(c, `/3/drive/${id}/files/${folderId(req.query.dir)}/files?limit=200`)) as any[];
      const web = await kdriveWeb(c, id);
      res.json(files.map((f) => kdItem(f, web)).sort(byFolderThenName));
    }
  } catch (e: any) {
    res.status(/configuré|manquant/.test(e.message) ? 409 : 502).json({ error: explain(e) });
  }
});

// Search by name anywhere (page Fichiers): each result knows its folder.
router.get('/:store/find', async (req: Request, res: Response) => {
  const store = req.params.store;
  const q = String(req.query.q ?? '').trim();
  if (!isStore(store)) {
    res.status(404).json({ error: 'Stockage inconnu' });
    return;
  }
  if (q.length < 2) {
    res.json([]);
    return;
  }
  try {
    const cfg = await storeRow(store);
    if (store === 'nextcloud') {
      res.json(await ncFind(await ncDav(cfg), q));
    } else {
      const c = kdConfig(cfg);
      const id = kdriveId(c);
      const params = new URLSearchParams({ query: q, limit: '50' });
      const files = (await kdriveJson(c, `/3/drive/${id}/files/search?${params}`)) as any[];
      const web = await kdriveWeb(c, id);
      res.json(files.map((f) => kdItem(f, web)));
    }
  } catch (e: any) {
    res.status(/configuré|manquant/.test(e.message) ? 409 : 502).json({ error: explain(e) });
  }
});

// New folder: { target: parent (path or id), name }.
router.post('/:store/folder', async (req: Request, res: Response) => {
  const store = req.params.store;
  const name = cleanName(String(req.body?.name ?? ''));
  if (!isStore(store)) {
    res.status(404).json({ error: 'Stockage inconnu' });
    return;
  }
  if (!name || name === '.' || name === '..') {
    res.status(400).json({ error: 'Nom de dossier invalide' });
    return;
  }
  try {
    const cfg = await storeRow(store);
    if (store === 'nextcloud') {
      const dav = await ncDav(cfg);
      const path = cleanPath(`${cleanPath(String(req.body?.target ?? '/'))}/${name}`);
      const r = await fetch(`${dav.url}${dav.root}${encodePath(path)}`, { method: 'MKCOL', headers: { Authorization: dav.auth }, signal: AbortSignal.timeout(TIMEOUT) });
      if (r.status === 405) throw new Error('Un élément porte déjà ce nom');
      if (r.status !== 201) throw new Error(`HTTP ${r.status}`);
      res.json({ ok: true, open: path, name });
    } else {
      const c = kdConfig(cfg);
      const body = await fetch(`${KDRIVE_API}/3/drive/${kdriveId(c)}/files/${folderId(req.body?.target)}/directory`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.api_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(TIMEOUT),
      }).then((r) => r.json() as Promise<any>);
      if (body?.result !== 'success') throw new Error(body?.error?.code === 'destination_already_exists' ? 'Un élément porte déjà ce nom' : body?.error?.description ?? 'Création impossible');
      res.json({ ok: true, open: String(body.data.id), name: body.data.name });
    }
  } catch (e: any) {
    res.status(e.message === 'Un élément porte déjà ce nom' ? 409 : 502).json({ error: explain(e) });
  }
});

// Cloudflare (free plan) refuses larger requests anyway; nginx allows this
// much on this route only. The body is streamed, never kept on the server.
const MAX_UPLOAD = 100 * 1024 * 1024;

// A file into a folder: ?target=<path or id>&name=…, the raw file as body.
router.post('/:store/upload', async (req: Request, res: Response) => {
  const store = req.params.store;
  const size = Number(req.headers['content-length']);
  const name = cleanName(String(req.query.name ?? ''));
  const target = String(req.query.target ?? '');
  if (!isStore(store)) {
    res.status(404).json({ error: 'Stockage inconnu' });
    return;
  }
  if (!name || name === '.' || name === '..') {
    res.status(400).json({ error: 'Nom de fichier invalide' });
    return;
  }
  if (!Number.isFinite(size) || size < 0) {
    res.status(411).json({ error: 'Taille du fichier inconnue' });
    return;
  }
  if (size > MAX_UPLOAD) {
    res.status(413).json({ error: 'Fichier trop gros (100 Mo au maximum depuis le portail)' });
    return;
  }
  try {
    const cfg = await storeRow(store);
    if (store === 'nextcloud') {
      const dav = await ncDav(cfg);
      const folder = `${dav.url}${dav.root}${encodePath(cleanPath(target))}`;
      // Never overwrite: "name (2).ext", "name (3).ext"…
      const dot = name.lastIndexOf('.');
      const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
      let final = name;
      for (let i = 2; i < 50; i++) {
        const head = await fetch(`${folder}/${encodeURIComponent(final)}`, { method: 'HEAD', headers: { Authorization: dav.auth }, signal: AbortSignal.timeout(TIMEOUT) });
        if (head.status === 404) break;
        final = `${stem} (${i})${ext}`;
      }
      const put = await fetch(`${folder}/${encodeURIComponent(final)}`, {
        method: 'PUT',
        headers: { Authorization: dav.auth, 'Content-Length': String(size), 'Content-Type': String(req.headers['content-type'] ?? 'application/octet-stream') },
        body: req as any,
        duplex: 'half',
      } as RequestInit);
      if (put.status !== 201 && put.status !== 204) throw new Error(put.status === 507 ? 'Plus de place sur Nextcloud' : `HTTP ${put.status}`);
      res.json({ ok: true, name: final });
    } else {
      const c = kdConfig(cfg);
      const params = new URLSearchParams({ total_size: String(size), directory_id: String(folderId(target || 1)), file_name: name, conflict: 'rename' });
      const up = await fetch(`${KDRIVE_API}/3/drive/${kdriveId(c)}/upload?${params}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.api_key}`, 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
        body: req as any,
        duplex: 'half',
      } as RequestInit);
      const body: any = await up.json().catch(() => null);
      if (!up.ok || body?.result !== 'success') throw new Error(body?.error?.description ?? `HTTP ${up.status}`);
      res.json({ ok: true, name: body.data?.name ?? name });
    }
  } catch (e: any) {
    // The browser may still be sending: drain it so the error reaches it.
    req.resume();
    res.status(502).json({ error: explain(e) });
  }
});

/* ----- kDrive: file search (Ctrl K → Fichiers) ------------------------------------ */

router.get('/kdrive/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const cfg: IntegrationRow | undefined = await db('integrations').where({ type: 'kdrive' }).first();
  if (!cfg?.enabled || !cfg.api_key) {
    res.status(409).json({ error: 'kDrive n’est pas configuré (Admin → Intégrations)' });
    return;
  }
  try {
    const id = kdriveId(cfg);
    const params = new URLSearchParams({ query: q, limit: '6' });
    const files = (await kdriveJson(cfg, `/3/drive/${id}/files/search?${params}`)) as any[];
    const web = await kdriveWeb(cfg, id);
    res.json(
      files.map((f) => ({
        title: f.name,
        sub: `kDrive · ${String(f.path ?? '').split('/').slice(0, -1).join('/') || '/'}`,
        // A folder opens as itself (same address as in the browser); a file
        // through the web app's internal link, which opens it in its folder.
        url: f.type === 'dir' ? `${web}/files/${f.id}` : `${web}/redirect/${f.id}`,
        folder: f.type === 'dir',
      })),
    );
  } catch (e: any) {
    res.status(502).json({ error: explain(e) });
  }
});

/* ----- Nextcloud: file search and maintenance (Ctrl K) ------------------------ */

async function ncConfig(res: Response): Promise<IntegrationRow | null> {
  const cfg: IntegrationRow | undefined = await db('integrations').where({ type: 'nextcloud' }).first();
  if (!cfg?.enabled || !cfg.url) {
    res.status(409).json({ error: 'Nextcloud n’est pas configuré (Admin → Intégrations)' });
    return null;
  }
  return cfg;
}

// Unified search, files provider. Needs the user + app password; links point
// at the tile's address (the public one) rather than the local API address.
router.get('/nextcloud/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const cfg = await ncConfig(res);
  if (!cfg) return;
  if (!cfg.username || !cfg.password) {
    res.status(409).json({ error: 'Mot de passe d’application Nextcloud manquant' });
    return;
  }
  try {
    const url = base(cfg.url!);
    const data = await getJson(`${url}/ocs/v2.php/search/providers/files/search?term=${encodeURIComponent(q)}&limit=6&format=json`, {
      headers: {
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`,
      },
    });
    const serviceId = await serviceFor(cfg);
    const tile = serviceId ? await db('services').where({ id: serviceId }).first('url') : null;
    const publicBase = tile?.url ? base(tile.url) : url;
    // Nextcloud builds links on the local address but with its public scheme
    // (https://192.168.1.10:8080/f/…): whatever the scheme, the local host
    // becomes the tile's address.
    const localHost = new URL(url).host;
    const toPublic = (link: string) => {
      try {
        const u = new URL(link, url);
        return u.host === localHost ? publicBase + u.pathname + u.search + u.hash : u.href;
      } catch {
        return link;
      }
    };
    res.json(
      (data.ocs.data.entries as any[]).map((e) => ({
        title: e.title,
        sub: e.subline ?? '',
        url: toPublic(String(e.resourceUrl ?? '')),
        folder: /folder/.test(e.icon ?? '') || e.attributes?.type === 'folder',
      })),
    );
  } catch (e: any) {
    res.status(502).json({ error: explain(e) });
  }
});

router.get('/nextcloud/action', (req: Request, res: Response) => {
  res.json(lastAction());
});

router.post('/nextcloud/action', async (req: Request, res: Response) => {
  const action = req.body?.action as NcAction;
  if (!(action in NC_ACTIONS)) {
    res.status(400).json({ error: 'Action inconnue' });
    return;
  }
  const cfg = await ncConfig(res);
  if (!cfg) return;
  try {
    const state = runAction(action);
    // Refresh the tile when it ends (and right away: "⏳ …").
    refreshOne(cfg).catch(() => undefined);
    const watch = setInterval(() => {
      if (state.endedAt) {
        clearInterval(watch);
        refreshOne(cfg).catch(() => undefined);
      }
    }, 2_000);
    res.status(202).json(state);
  } catch (e: any) {
    res.status(409).json({ error: e.message });
  }
});

router.delete('/:type', async (req: Request, res: Response) => {
  await db('integrations').where({ type: req.params.type }).delete();
  widgets.delete(req.params.type as IntegrationType);
  res.json({ success: true });
});

export default router;

import { Router, Request, Response } from 'express';
import db from '../db.js';
import { audit } from '../services/audit.js';

/**
 * Home Assistant widgets (frontend pages/Maison.tsx and the home page's
 * Maison section). The widgets live in `ha_widgets`; GET /widgets returns
 * them with the live state of every entity they use, and a 24 h history
 * (48 half-hour points) for the "value" ones.
 *
 * Controls only act on entities placed in a "control" widget: the portal
 * never becomes a remote for the whole house by accident.
 */

const router = Router();
const TIMEOUT = 8_000;
const KINDS = ['value', 'room', 'status', 'control'] as const;
type Kind = (typeof KINDS)[number];
const SIZES = ['small', 'wide'] as const;
const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;

interface WidgetRow {
  id: number;
  kind: Kind;
  title: string;
  entities: string[];
  on_home: boolean;
  size: string;
  position: number;
}

const toJson = (w: WidgetRow) => ({
  id: w.id,
  kind: w.kind,
  title: w.title,
  entities: w.entities,
  onHome: w.on_home,
  size: w.size,
  position: w.position,
});

async function haConfig(res: Response): Promise<{ url: string; headers: Record<string, string> } | null> {
  const cfg = await db('integrations').where({ type: 'homeassistant' }).first();
  if (!cfg?.enabled || !cfg.url || !cfg.api_key) {
    res.status(409).json({ error: 'Home Assistant n’est pas configuré (Admin → Intégrations)' });
    return null;
  }
  return {
    url: String(cfg.url).replace(/\/+$/, ''),
    headers: { Authorization: `Bearer ${cfg.api_key}`, 'Content-Type': 'application/json' },
  };
}

async function haFetch(url: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), ...init });
  if (!res.ok) throw new Error(res.status === 401 ? 'Jeton Home Assistant refusé' : `Home Assistant : HTTP ${res.status}`);
  return res.json();
}

/* ----- History: 48 half-hour points over 24 h, kept 5 min ------------------- */

const POINTS = 48;
const history = new Map<string, { at: number; points: { t: number; v: number }[] }>();

async function historyFor(ha: { url: string; headers: Record<string, string> }, ids: string[]) {
  const stale = ids.filter((id) => Date.now() - (history.get(id)?.at ?? 0) > 5 * 60_000);
  if (stale.length) {
    const end = Date.now();
    const start = end - 24 * 3600_000;
    const q = new URLSearchParams({
      filter_entity_id: stale.join(','),
      end_time: new Date(end).toISOString(),
      minimal_response: '',
      no_attributes: '',
      significant_changes_only: '',
    });
    const data = (await haFetch(`${ha.url}/api/history/period/${new Date(start).toISOString()}?${q}`, { headers: ha.headers })) as any[][];
    const step = (end - start) / POINTS;
    for (const series of data) {
      const id = series[0]?.entity_id;
      if (!id) continue;
      const samples = series
        .map((s: any) => ({ t: new Date(s.last_changed ?? s.last_updated).getTime(), v: Number(s.state) }))
        .filter((s) => Number.isFinite(s.v));
      // Each half hour: the mean of its samples, else the last known value.
      const points: { t: number; v: number }[] = [];
      let last = samples[0]?.v;
      let j = 0;
      for (let i = 0; i < POINTS; i++) {
        const from = start + i * step;
        const to = from + step;
        const inside: number[] = [];
        while (j < samples.length && samples[j].t < to) {
          if (samples[j].t >= from) inside.push(samples[j].v);
          last = samples[j].v;
          j++;
        }
        const v = inside.length ? inside.reduce((a, b) => a + b, 0) / inside.length : last;
        if (v !== undefined && Number.isFinite(v)) points.push({ t: to, v });
      }
      history.set(id, { at: Date.now(), points });
    }
    // Entities with no numeric history: remember that too, for 5 min.
    for (const id of stale) if (!history.has(id) || Date.now() - history.get(id)!.at > 5 * 60_000) history.set(id, { at: Date.now(), points: [] });
  }
  return Object.fromEntries(ids.map((id) => [id, history.get(id)?.points ?? []]));
}

/* ----- Widgets ------------------------------------------------------------------ */

router.get('/widgets', async (req: Request, res: Response) => {
  const rows: WidgetRow[] = await db('ha_widgets').orderBy('position').orderBy('id');
  const ha = await haConfig(res);
  if (!ha) return;
  try {
    const states = (await haFetch(`${ha.url}/api/states`, { headers: ha.headers })) as any[];
    const wanted = new Set(rows.flatMap((w) => w.entities));
    const live: Record<string, unknown> = {};
    for (const s of states) {
      if (!wanted.has(s.entity_id)) continue;
      live[s.entity_id] = {
        id: s.entity_id,
        domain: s.entity_id.split('.')[0],
        name: s.attributes?.friendly_name ?? s.entity_id,
        state: s.state,
        unit: s.attributes?.unit_of_measurement ?? null,
        deviceClass: s.attributes?.device_class ?? null,
        changed: s.last_changed,
        // Covers report how open they are; lights their brightness (0-255),
        // colour and white temperature, and which of these they support.
        position: s.attributes?.current_position ?? null,
        brightness: s.attributes?.brightness ?? null,
        colorModes: s.attributes?.supported_color_modes ?? null,
        rgb: s.attributes?.rgb_color ?? null,
        kelvin: s.attributes?.color_temp_kelvin ?? null,
        minKelvin: s.attributes?.min_color_temp_kelvin ?? null,
        maxKelvin: s.attributes?.max_color_temp_kelvin ?? null,
      };
    }
    const curves = [...new Set(rows.filter((w) => w.kind === 'value').flatMap((w) => w.entities))];
    const hist = curves.length ? await historyFor(ha, curves).catch(() => ({})) : {};
    res.json({ widgets: rows.map(toJson), states: live, history: hist });
  } catch (e: any) {
    res.status(502).json({ error: e?.name === 'TimeoutError' ? 'Home Assistant ne répond pas' : e.message, widgets: rows.map(toJson) });
  }
});

function clean(body: any, partial: boolean) {
  const out: Record<string, unknown> = {};
  if (!partial || body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) throw new Error('Type de widget inconnu');
    out.kind = body.kind;
  }
  if (!partial || body.entities !== undefined) {
    const list = body.entities;
    if (!Array.isArray(list) || !list.length || list.length > 16 || list.some((e: unknown) => typeof e !== 'string' || !ENTITY.test(e))) {
      throw new Error('Choisis de 1 à 16 entités valides');
    }
    out.entities = JSON.stringify([...new Set(list)]);
  }
  if (body.title !== undefined) out.title = String(body.title).slice(0, 80);
  if (body.onHome !== undefined) out.on_home = !!body.onHome;
  if (body.size !== undefined) {
    if (!SIZES.includes(body.size)) throw new Error('Taille inconnue');
    out.size = body.size;
  }
  return out;
}

router.post('/widgets', async (req: Request, res: Response) => {
  try {
    const row = clean(req.body ?? {}, false);
    const max = await db('ha_widgets').max('position as m').first();
    const [created] = await db('ha_widgets')
      .insert({ ...row, position: ((max as any)?.m ?? -1) + 1 })
      .returning('*');
    res.status(201).json(toJson(created));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/widgets/order', async (req: Request, res: Response) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id))) {
    res.status(400).json({ error: 'Ordre invalide' });
    return;
  }
  await db.transaction(async (trx) => {
    for (const [i, id] of ids.entries()) await trx('ha_widgets').where({ id }).update({ position: i });
  });
  res.json({ ok: true });
});

router.put('/widgets/:id', async (req: Request, res: Response) => {
  try {
    const row = clean(req.body ?? {}, true);
    const [updated] = await db('ha_widgets').where({ id: Number(req.params.id) }).update(row).returning('*');
    if (!updated) {
      res.status(404).json({ error: 'Widget introuvable' });
      return;
    }
    res.json(toJson(updated));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/widgets/:id', async (req: Request, res: Response) => {
  await db('ha_widgets').where({ id: Number(req.params.id) }).delete();
  res.json({ ok: true });
});

/* ----- Controls -------------------------------------------------------------------- */

// action → Home Assistant service, per domain.
const SERVICES: Record<string, Record<string, string>> = {
  light: { toggle: 'toggle', set: 'turn_on' },
  switch: { toggle: 'toggle' },
  fan: { toggle: 'toggle' },
  input_boolean: { toggle: 'toggle' },
  script: { run: 'turn_on' },
  scene: { run: 'turn_on' },
  button: { run: 'press' },
  input_button: { run: 'press' },
  cover: { open: 'open_cover', close: 'close_cover', stop: 'stop_cover' },
  lock: { lock: 'lock', unlock: 'unlock' },
  vacuum: { start: 'start', dock: 'return_to_base' },
};

router.post('/control', async (req: Request, res: Response) => {
  const { entityId, action } = req.body ?? {};
  if (typeof entityId !== 'string' || !ENTITY.test(entityId)) {
    res.status(400).json({ error: 'Entité invalide' });
    return;
  }
  const domain = entityId.split('.')[0];
  const service = SERVICES[domain]?.[action];
  if (!service) {
    res.status(400).json({ error: 'Action impossible sur ce type d’entité' });
    return;
  }
  // Lights: brightness (1-100 %), colour (r, g, b) or white temperature (K).
  const extra: Record<string, unknown> = {};
  if (action === 'set') {
    const { brightness, rgb, kelvin } = req.body ?? {};
    if (brightness !== undefined) {
      if (!Number.isInteger(brightness) || brightness < 1 || brightness > 100) {
        res.status(400).json({ error: 'Luminosité entre 1 et 100 %' });
        return;
      }
      extra.brightness_pct = brightness;
    }
    if (rgb !== undefined) {
      if (!Array.isArray(rgb) || rgb.length !== 3 || rgb.some((c) => !Number.isInteger(c) || c < 0 || c > 255)) {
        res.status(400).json({ error: 'Couleur invalide' });
        return;
      }
      extra.rgb_color = rgb;
    }
    if (kelvin !== undefined) {
      if (!Number.isInteger(kelvin) || kelvin < 1000 || kelvin > 10000) {
        res.status(400).json({ error: 'Température de blanc invalide' });
        return;
      }
      extra.color_temp_kelvin = kelvin;
    }
    if (!Object.keys(extra).length || (extra.rgb_color && extra.color_temp_kelvin)) {
      res.status(400).json({ error: 'Choisis une luminosité, une couleur ou un blanc' });
      return;
    }
  }
  const allowed = await db('ha_widgets').where({ kind: 'control' }).whereRaw('entities \\? ?', [entityId]).first();
  if (!allowed) {
    res.status(403).json({ error: 'Cette entité n’est dans aucun widget de contrôle' });
    return;
  }
  const ha = await haConfig(res);
  if (!ha) return;
  try {
    await haFetch(`${ha.url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: ha.headers,
      body: JSON.stringify({ entity_id: entityId, ...extra }),
    });
    // Give the device a moment, then report its new state.
    await new Promise((r) => setTimeout(r, 700));
    const s = await haFetch(`${ha.url}/api/states/${entityId}`, { headers: ha.headers });
    void audit({
      action: 'CONTROL',
      entityType: 'HA_ENTITY',
      entityId,
      newValues: { action, name: s.attributes?.friendly_name ?? entityId, state: s.state, ...extra },
      req,
    });
    res.json({ ok: true, state: s.state });
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});

/* ----- Status bar: up to 4 entities in place of the city weather ----------------- */

// Home Assistant weather conditions → the OpenWeather icon codes the status bar draws.
const CONDITION_ICON: Record<string, string> = {
  sunny: '01d',
  'clear-night': '01n',
  partlycloudy: '02d',
  cloudy: '04d',
  fog: '50d',
  windy: '04d',
  'windy-variant': '04d',
  rainy: '10d',
  pouring: '09d',
  hail: '09d',
  lightning: '11d',
  'lightning-rainy': '11d',
  snowy: '13d',
  'snowy-rainy': '13d',
  exceptional: '50d',
};

const CONDITION_FR: Record<string, string> = {
  sunny: 'Ensoleillé',
  'clear-night': 'Nuit claire',
  partlycloudy: 'Éclaircies',
  cloudy: 'Nuageux',
  fog: 'Brouillard',
  windy: 'Venteux',
  'windy-variant': 'Venteux',
  rainy: 'Pluie',
  pouring: 'Averses',
  hail: 'Grêle',
  lightning: 'Orage',
  'lightning-rainy': 'Orage',
  snowy: 'Neige',
  'snowy-rainy': 'Neige fondue',
  exceptional: 'Exceptionnel',
};

async function statusbarIds(): Promise<string[]> {
  const cfg = await db('integrations').where({ type: 'homeassistant' }).first();
  const list = cfg?.options?.statusbar;
  return Array.isArray(list) ? list.filter((e: unknown) => typeof e === 'string' && ENTITY.test(e)) : [];
}

router.get('/statusbar', async (req: Request, res: Response) => {
  const ids = await statusbarIds();
  if (!ids.length) {
    res.json({ entities: [] });
    return;
  }
  const ha = await haConfig(res);
  if (!ha) return;
  try {
    const states = (await haFetch(`${ha.url}/api/states`, { headers: ha.headers })) as any[];
    const byId = new Map(states.map((s) => [s.entity_id, s]));
    res.json({
      entities: ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((s: any) => {
          const weather = s.entity_id.startsWith('weather.');
          return {
            id: s.entity_id,
            domain: s.entity_id.split('.')[0],
            name: s.attributes?.friendly_name ?? s.entity_id,
            state: weather ? String(s.attributes?.temperature ?? '') : s.state,
            unit: weather ? s.attributes?.temperature_unit ?? '°C' : s.attributes?.unit_of_measurement ?? null,
            deviceClass: weather ? 'temperature' : s.attributes?.device_class ?? null,
            changed: s.last_changed,
            icon: weather ? CONDITION_ICON[s.state] ?? null : null,
            condition: weather ? CONDITION_FR[s.state] ?? s.state : null,
            humidity: weather ? s.attributes?.humidity ?? null : null,
          };
        }),
    });
  } catch (e: any) {
    res.status(502).json({ error: e.message, entities: [] });
  }
});

router.put('/statusbar', async (req: Request, res: Response) => {
  const list = req.body?.entities;
  if (!Array.isArray(list) || list.length > 4 || list.some((e) => typeof e !== 'string' || !ENTITY.test(e))) {
    res.status(400).json({ error: 'Jusqu’à 4 entités valides' });
    return;
  }
  const cfg = await db('integrations').where({ type: 'homeassistant' }).first();
  if (!cfg) {
    res.status(409).json({ error: 'Home Assistant n’est pas configuré (Admin → Intégrations)' });
    return;
  }
  await db('integrations')
    .where({ type: 'homeassistant' })
    .update({ options: JSON.stringify({ ...(cfg.options ?? {}), statusbar: list }), updated_at: new Date() });
  res.json({ ok: true, entities: list });
});

export default router;

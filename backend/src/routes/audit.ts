import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// Get audit logs with filters
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, action, limit = 100, offset = 0 } = req.query;

    let query = db('audit_logs');

    if (entity_type) query = query.where('entity_type', entity_type as string);
    if (entity_id) query = query.where('entity_id', entity_id as string);
    if (action) query = query.where('action', action as string);

    const logs = await query
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit as string) || 100)
      .offset(parseInt(offset as string) || 0);

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/* ----- Action history (System page) ------------------------------------- */

type Group = 'liens' | 'docker' | 'maison' | 'medias';
type Entry = {
  id: string;
  at: string;
  group: Group;
  kind: string;
  title: string;
  subject: string;
  detail?: string;
  failed?: boolean;
  /** Deleted link that can be brought back: its id. */
  restoreId?: string;
};

const js = (v: unknown): Record<string, any> => {
  if (!v) return {};
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v as Record<string, any>;
};

const size = (bytes: number) => {
  const go = bytes / 1024 ** 3;
  return go >= 1 ? `${go.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go` : `${Math.round(bytes / 1024 ** 2)} Mo`;
};

const DOCKER_VERB: Record<string, string> = { RESTART: 'Conteneur redémarré', STOP: 'Conteneur arrêté', START: 'Conteneur démarré' };
const HA_VERB: Record<string, string> = { on: 'Allumé', off: 'Éteint', toggle: 'Basculé', open: 'Ouvert', close: 'Fermé', stop: 'Arrêté', press: 'Déclenché', run: 'Lancé', lock: 'Verrouillé', unlock: 'Déverrouillé', set: 'Réglé' };

/** One audit row → one readable line, or null for noise (theme tweaks, favourites, reorders). */
function describe(row: any, folders: Map<string, string>, existing: Set<string>): Entry | null {
  const o = js(row.old_values);
  const n = js(row.new_values);
  const base = { id: row.id, at: new Date(row.created_at).toISOString() };
  switch (`${row.entity_type}:${row.action}`) {
    case 'SERVICE:CREATE':
      return { ...base, group: 'liens', kind: 'create', title: 'Lien ajouté', subject: n.name ?? '?', detail: folders.get(n.category_id) };
    case 'SERVICE:DELETE':
      return {
        ...base,
        group: 'liens',
        kind: 'delete',
        title: 'Lien supprimé',
        subject: o.name ?? '?',
        detail: o.url,
        restoreId: o.url && !existing.has(row.entity_id) ? row.entity_id : undefined,
      };
    case 'SERVICE:RESTORE':
      return { ...base, group: 'liens', kind: 'restore', title: 'Lien restauré', subject: n.name ?? '?', detail: folders.get(n.category_id) };
    case 'SERVICE:UPDATE': {
      const changes: string[] = [];
      if (n.name !== undefined && n.name !== o.name) changes.push(`renommé (avant : ${o.name})`);
      if (n.url !== undefined && n.url !== o.url) changes.push('adresse modifiée');
      if (n.description !== undefined && (n.description ?? '') !== (o.description ?? '')) changes.push(n.description ? 'commentaire modifié' : 'commentaire retiré');
      if (n.category_id !== undefined && n.category_id !== o.category_id) changes.push(`déplacé vers ${folders.get(n.category_id) ?? 'un autre dossier'}`);
      if (!changes.length) return null;
      return { ...base, group: 'liens', kind: 'update', title: 'Lien modifié', subject: n.name ?? o.name ?? '?', detail: changes.join(' · ') };
    }
    case 'CATEGORY:CREATE':
      return { ...base, group: 'liens', kind: 'create', title: 'Dossier créé', subject: n.name ?? '?' };
    case 'CATEGORY:DELETE':
      return { ...base, group: 'liens', kind: 'delete', title: 'Dossier supprimé', subject: o.name ?? '?' };
    case 'CATEGORY:UPDATE':
      return n.name && n.name !== o.name ? { ...base, group: 'liens', kind: 'update', title: 'Dossier renommé', subject: n.name, detail: `avant : ${o.name}` } : null;
    case 'DOCKER_CONTAINER:RESTART':
    case 'DOCKER_CONTAINER:STOP':
    case 'DOCKER_CONTAINER:START':
      return { ...base, group: 'docker', kind: row.action.toLowerCase(), title: DOCKER_VERB[row.action], subject: row.entity_id };
    case 'DOCKER_CONTAINER:UPDATE_IMAGE':
      return n.ok
        ? { ...base, group: 'docker', kind: 'update', title: 'Conteneur mis à jour', subject: row.entity_id }
        : { ...base, group: 'docker', kind: 'error', title: 'Mise à jour échouée', subject: row.entity_id, detail: n.error, failed: true };
    case 'DOCKER:PRUNE': {
      const freed = Object.values(js(n.freed)).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
      return { ...base, group: 'docker', kind: 'prune', title: 'Nettoyage Docker', subject: freed ? `${size(freed)} libérés` : 'rien à libérer' };
    }
    case 'HA_ENTITY:CONTROL':
      return { ...base, group: 'maison', kind: 'control', title: HA_VERB[n.action] ?? 'Commandé', subject: n.name ?? row.entity_id };
    case 'NEXTCLOUD:NC_ACTION':
      return { ...base, group: 'docker', kind: 'action', title: 'Nextcloud', subject: n.label ?? row.entity_id };
    case 'JELLYSEERR:REQUEST':
      return { ...base, group: 'medias', kind: 'request', title: n.mediaType === 'tv' ? 'Série demandée' : 'Film demandé', subject: n.title ?? '?' };
    default:
      return null;
  }
}

// GET /api/audit/timeline?limit=40&before=<iso>&group=liens|docker|maison|medias
router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 40, 1), 200);
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    const group = String(req.query.group ?? '');
    const folders = new Map<string, string>((await db('categories').select('id', 'name')).map((c: any) => [c.id, c.name]));
    const existing = new Set<string>((await db('services').select('id')).map((s: any) => String(s.id)));
    // entity=<id>,<container>…: one service's history (details panel, hover card).
    const entities = String(req.query.entity ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
    const out: Entry[] = [];
    let cursor = before && !isNaN(+before) ? before : null;
    // Noise rows are skipped, so read in pages until the page is full.
    for (let page = 0; page < 10 && out.length < limit; page++) {
      let q = db('audit_logs').whereNot('entity_type', 'THEME_CONFIG').orderBy('created_at', 'desc').limit(200);
      if (cursor) q = q.where('created_at', '<', cursor);
      if (entities.length) q = q.whereIn('entity_id', entities);
      const rows = await q;
      if (!rows.length) break;
      for (const row of rows) {
        const e = describe(row, folders, existing);
        if (e && (!group || e.group === group)) out.push(e);
        if (out.length >= limit) break;
      }
      cursor = new Date(rows[rows.length - 1].created_at);
      if (rows.length < 200) break;
    }
    res.json({ entries: out, more: out.length >= limit });
  } catch (error: any) {
    console.error('timeline:', error.message);
    res.status(500).json({ error: "Impossible de lire l'historique" });
  }
});

// Get access logs for a service
router.get('/access/:service_id', async (req: Request, res: Response) => {
  try {
    const { service_id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const logs = await db('access_logs')
      .where('service_id', service_id)
      .orderBy('accessed_at', 'desc')
      .limit(parseInt(limit as string) || 100)
      .offset(parseInt(offset as string) || 0);

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch access logs' });
  }
});

// Get audit log details
router.get('/logs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const log = await db('audit_logs').where('id', id).first();
    if (!log) {
      res.status(404).json({ error: 'Audit log not found' });
      return;
    }
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Get stats - count changes by entity type
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await db('audit_logs')
      .select('entity_type', 'action')
      .count('* as count')
      .groupBy('entity_type', 'action');

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;

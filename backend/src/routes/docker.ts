import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dockerService } from '../services/docker.js';
import { sseManager } from '../utils/sse.js';
import db from '../db.js';
import { syncDiscovered } from '../services/discovery.js';
import { getOverview } from '../services/containers.js';
import { getTopology } from '../services/topology.js';
import { checkUpdates, getUpdates, prune, prunePreview, startUpdate } from '../services/updates.js';

const router = Router();

/**
 * GET /api/docker/containers
 * List all Docker containers
 */
// Containers, networks and live traffic for the infrastructure map.
router.get('/topology', async (req: Request, res: Response) => {
  try {
    res.json(await getTopology());
  } catch (e: any) {
    console.error('topology:', e.message);
    res.status(500).json({ error: 'Docker indisponible' });
  }
});

/* ---- Updates and cleanup (services/updates.ts) ---------------------------- */

// { checkedAt, checking, containers: { [name]: { image, state } }, jobs: { [name]: job } }
router.get('/updates', (req: Request, res: Response) => {
  res.json(getUpdates());
});

// Asks the registries again now (answers once done).
router.post('/updates/check', async (req: Request, res: Response) => {
  await checkUpdates(true);
  res.json(getUpdates());
});

// Pulls and recreates one container; follow it through GET /updates → jobs.
router.post('/updates/:name', async (req: Request, res: Response) => {
  const name = req.params.name;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) return void res.status(400).json({ error: 'Invalid name' });
  const known = getUpdates().containers[name];
  if (known?.state === 'self') return void res.status(400).json({ error: 'Le portail ne peut pas se mettre à jour lui-même' });
  res.json(startUpdate(name));
});

// What each cleanup would free.
router.get('/prune', async (req: Request, res: Response) => {
  try {
    res.json(await prunePreview());
  } catch (e: any) {
    console.error('prune preview:', e.message);
    res.status(500).json({ error: 'Docker indisponible' });
  }
});

// { containers?, images?: 'dangling' | 'unused', networks?, buildCache?, volumes? }
router.post('/prune', async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    res.json(
      await prune({
        containers: b.containers === true,
        images: b.images === 'dangling' || b.images === 'unused' ? b.images : false,
        networks: b.networks === true,
        buildCache: b.buildCache === true,
        volumes: b.volumes === true,
      }),
    );
  } catch (e: any) {
    console.error('prune:', e.message);
    res.status(500).json({ error: String(e?.json?.message ?? e?.message ?? 'Échec du nettoyage') });
  }
});

// Every container with CPU / RAM and an hour of history (System page).
router.get('/overview', (req: Request, res: Response) => {
  res.json(getOverview());
});

// Containers carrying nexus.* labels (Docker auto-discovery), synced first.
router.get('/discovered', async (req: Request, res: Response) => {
  try {
    res.json(await syncDiscovered());
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to discover containers' });
  }
});

router.get('/containers', async (req: Request, res: Response) => {
  try {
    const containers = await dockerService.listContainers();
    res.json(containers);
  } catch (error: any) {
    console.error('Error listing containers:', error);
    res.status(500).json({ error: 'Failed to list containers' });
  }
});

/**
 * GET /api/docker/stats/aggregated
 * Get aggregated stats for all Docker containers
 * NOTE: This must come BEFORE /stats/:containerId to prevent Express from matching 'aggregated' as a containerId
 */
router.get('/stats/aggregated', async (req: Request, res: Response) => {
  try {
    const stats = await dockerService.getAggregatedStats();

    if (!stats) {
      return res.status(503).json({ error: 'Unable to fetch aggregated Docker stats' });
    }

    res.json(stats);
  } catch (error: any) {
    console.error('Error getting aggregated stats:', error);
    res.status(500).json({ error: 'Failed to get aggregated Docker stats' });
  }
});

/**
 * GET /api/docker/stats/stream
 * Stream container stats for all services with Docker enabled (SSE)
 * NOTE: This must come BEFORE /stats/:containerId to prevent Express from matching 'stream' as a containerId
 */
router.get('/stats/stream', async (req: Request, res: Response) => {
  const clientId = sseManager.addClient('docker-stats', res);
  console.log(`New SSE client connected for docker-stats. Client ID: ${clientId}`);

  // Send heartbeat every second to keep connection alive
  const heartbeatInterval = setInterval(() => {
    sseManager.sendToClient(res, 'heartbeat', { timestamp: Date.now() });
  }, 1000);

  // Start sending stats every 2 seconds
  let intervalCount = 0;
  const interval = setInterval(async () => {
    intervalCount++;
    try {
      // Get all services with Docker enabled
      const services = await db('services')
        .whereNotNull('stats')
        .select('id', 'stats');

      for (const service of services) {
        try {
          let stats_obj = service.stats;

          // Parse if it's a JSON string
          if (typeof stats_obj === 'string') {
            stats_obj = JSON.parse(stats_obj);
          }

          // Check if Docker is enabled for this service
          if (stats_obj?.dockerEnabled && stats_obj?.dockerContainer) {
            const dockerStats = await dockerService.getContainerStats(stats_obj.dockerContainer);

            if (dockerStats) {
              sseManager.sendToChannel('docker-stats', 'stats', {
                serviceId: service.id,
                stats: dockerStats,
              });
            }
          }
        } catch (serviceError) {
          console.error(`Error getting stats for service ${service.id}:`, serviceError);
        }
      }
    } catch (error: any) {
      console.error('Error in stats stream:', error.message);
    }
  }, 2000); // Send every 2 seconds

  // Clean up interval on disconnect
  res.on('close', () => {
    clearInterval(interval);
    clearInterval(heartbeatInterval);
    console.log(`SSE client disconnected from docker-stats. Total clients: ${sseManager.getClientCount('docker-stats')}`);
  });
});

/**
 * GET /api/docker/stats/:containerId
 * Get container stats (one-time)
 * NOTE: This comes AFTER /stats/stream to prevent Express from matching 'stream' as a containerId
 */
router.get('/stats/:containerId', async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;
    const stats = await dockerService.getContainerStats(containerId);

    if (!stats) {
      return res.status(404).json({ error: 'Container not found or stats unavailable' });
    }

    res.json(stats);
  } catch (error: any) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get container stats' });
  }
});

/**
 * GET /api/docker/logs/:containerId
 * Get container logs (historical)
 */
router.get('/logs/:containerId', async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;
    const lines = parseInt(req.query.lines as string) || 100;

    const logs = await dockerService.getLogs(containerId, Math.min(lines, 500)); // Max 500 lines

    res.json({ logs });
  } catch (error: any) {
    console.error('Error getting logs:', error);
    res.status(500).json({ error: 'Failed to get container logs' });
  }
});

/**
 * GET /api/docker/logs/stream/:containerId
 * Stream container logs (SSE)
 */
router.get('/logs/stream/:containerId', async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;
    const channel = `docker-logs-${containerId}`;

    const clientId = sseManager.addClient(channel, res);
    console.log(`New SSE client connected for logs stream: ${containerId}. Client ID: ${clientId}`);

    // Send heartbeat every second to keep connection alive (Cloudflare compatibility)
    const heartbeatInterval = setInterval(() => {
      sseManager.sendToClient(res, 'heartbeat', { timestamp: Date.now() });
    }, 1000);

    // Start streaming logs
    const logsStream = await dockerService.streamLogs(containerId, (log: string) => {
      try {
        sseManager.sendToChannel(channel, 'log', {
          containerId,
          log: log.trim(),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error sending log to SSE:', error);
      }
    });

    // Clean up stream on client disconnect
    res.on('close', () => {
      clearInterval(heartbeatInterval);
      if ((logsStream as any).destroy) {
        (logsStream as any).destroy();
      } else if ((logsStream as any).removeAllListeners) {
        (logsStream as any).removeAllListeners();
      }
      console.log(`SSE client disconnected from logs stream: ${containerId}`);
    });

    (logsStream as any).on('error', (error: any) => {
      console.error(`Error in logs stream for ${containerId}:`, error);
      res.end();
    });
  } catch (error: any) {
    console.error('Error starting logs stream:', error);
    res.status(500).json({ error: 'Failed to stream logs' });
  }
});

/**
 * POST /api/docker/:containerId/restart
 * Restart a container
 */
router.post('/:containerId/restart', async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;

    await dockerService.restartContainer(containerId);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'RESTART',
      entity_type: 'DOCKER_CONTAINER',
      entity_id: containerId,
      old_values: JSON.stringify({}),
      new_values: JSON.stringify({ action: 'restart' }),
      ip_address: req.ip || 'unknown',
      user_agent: req.get('user-agent') || 'unknown',
      created_at: new Date(),
    });

    res.json({ success: true, message: `Container ${containerId} restarted` });
  } catch (error: any) {
    console.error('Error restarting container:', error);
    res.status(500).json({ error: 'Failed to restart container' });
  }
});

/**
 * POST /api/docker/:containerId/stop
 * Stop a container
 */
router.post('/:containerId/stop', async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;

    await dockerService.stopContainer(containerId);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'STOP',
      entity_type: 'DOCKER_CONTAINER',
      entity_id: containerId,
      old_values: JSON.stringify({}),
      new_values: JSON.stringify({ action: 'stop' }),
      ip_address: req.ip || 'unknown',
      user_agent: req.get('user-agent') || 'unknown',
      created_at: new Date(),
    });

    res.json({ success: true, message: `Container ${containerId} stopped` });
  } catch (error: any) {
    console.error('Error stopping container:', error);
    res.status(500).json({ error: 'Failed to stop container' });
  }
});

/**
 * POST /api/docker/:containerId/start
 * Start a container
 */
router.post('/:containerId/start', async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;

    await dockerService.startContainer(containerId);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'START',
      entity_type: 'DOCKER_CONTAINER',
      entity_id: containerId,
      old_values: JSON.stringify({}),
      new_values: JSON.stringify({ action: 'start' }),
      ip_address: req.ip || 'unknown',
      user_agent: req.get('user-agent') || 'unknown',
      created_at: new Date(),
    });

    res.json({ success: true, message: `Container ${containerId} started` });
  } catch (error: any) {
    console.error('Error starting container:', error);
    res.status(500).json({ error: 'Failed to start container' });
  }
});

/**
 * GET /api/docker/health
 * Check Docker connection health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const isHealthy = await dockerService.testConnection();

    if (isHealthy) {
      res.json({ status: 'healthy', docker: 'connected' });
    } else {
      res.status(503).json({ status: 'unhealthy', docker: 'disconnected' });
    }
  } catch (error: any) {
    console.error('Error checking Docker health:', error);
    res.status(503).json({ status: 'unhealthy', error: 'Docker connection failed' });
  }
});

export default router;

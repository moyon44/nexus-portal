import express from 'express';
import cors from 'cors';
import db from './db.js';
import servicesRouter from './routes/services.js';
import categoriesRouter from './routes/categories.js';
import themeRouter from './routes/theme.js';
import auditRouter from './routes/audit.js';
import weatherRouter from './routes/weather.js';
import dockerRouter from './routes/docker.js';
import systemRouter from './routes/system.js';
import jellyfinRouter from './routes/jellyfin.js';
import linksRouter from './routes/links.js';
import wrappedRouter from './routes/wrapped.js';
import skinsRouter from './routes/skins.js';
import petRouter from './routes/pet.js';
import { startPet } from './services/pet.js';
import { dockerService } from './services/docker.js';
import { startMonitor } from './services/monitor.js';
import { startTvWatch } from './services/tv.js';
import { startUpdateChecks } from './services/updates.js';
import { startLinkChecks } from './services/linkcheck.js';
import { startDiscovery } from './services/discovery.js';
import { startContainerSampler } from './services/containers.js';
import integrationsRouter, { startWidgets } from './routes/integrations.js';
import haRouter from './routes/ha.js';
import searchRouter from './routes/search.js';

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Middleware
app.use(cors({
  // Extra origins (your public address) come from CORS_ORIGINS, comma-separated.
  origin: ['http://localhost:3000', 'http://localhost', ...(process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api/services', servicesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/theme', themeRouter);
app.use('/api/audit', auditRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/docker', dockerRouter);
app.use('/api/system', systemRouter);
app.use('/api/jellyfin', jellyfinRouter);
app.use('/api/links', linksRouter);
app.use('/api/wrapped', wrappedRouter);
app.use('/api/skins', skinsRouter);
app.use('/api/pet', petRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/ha', haRouter);
app.use('/api/search', searchRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);

  // Test database connection
  try {
    await db.raw('SELECT 1');
    console.log('✓ Database connected');
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    process.exit(1);
  }

  // Test Docker connection
  try {
    const isHealthy = await dockerService.testConnection();
    if (isHealthy) {
      console.log('✓ Docker connected');
    } else {
      console.warn('⚠ Docker connection failed - Docker features will be unavailable');
    }
  } catch (error) {
    console.warn('⚠ Docker connection test failed - Docker features will be unavailable');
  }

  startMonitor();
  startUpdateChecks();
  startLinkChecks();
  startPet();
  void startTvWatch();
  startDiscovery();
  startContainerSampler();
  startWidgets();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.destroy().then(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
});

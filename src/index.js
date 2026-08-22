'use strict';

const express = require('express');
const pinoHttp = require('pino-http');
const client = require('prom-client');

const config = require('./config');
const logger = require('./logger');
const db = require('./db');
const tasksRouter = require('./routes/tasks');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp({ logger }));

// --- Metrics ---
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

app.get('/', (req, res) => {
  res.status(200).json({
    service: 'comsync-task-api',
    gitSha: config.gitSha,
    endpoints: ['/healthz', '/readyz', '/metrics', '/api/tasks'],
  });
});

// --- Health checks ---
// Liveness: process is up and can serve traffic (no external dependency).
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', gitSha: config.gitSha });
});

// Readiness: safe to receive traffic (dependencies reachable).
// Bounded timeout so a hung DB doesn't hang the readiness probe itself.
app.get('/readyz', async (req, res) => {
  try {
    await Promise.race([
      db.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('db ping timeout')), 2000)),
    ]);
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    req.log.warn({ err }, 'readiness check failed');
    res.status(503).json({ status: 'not-ready', reason: err.message });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

// Serverless platforms invoke this module directly without calling start(),
// so migration must also happen lazily on first request, not only at boot.
let migrationPromise = null;
function ensureMigrated() {
  if (!migrationPromise) migrationPromise = db.migrate();
  return migrationPromise;
}

app.use('/api', async (req, res, next) => {
  try {
    await ensureMigrated();
    next();
  } catch (err) {
    next(err);
  }
});
app.use('/api', tasksRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Central error handler: never leak internals, always log.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  req.log.error({ err }, 'unhandled request error');
  res.status(500).json({ error: 'internal server error' });
});

let server;

async function start() {
  try {
    await ensureMigrated();
  } catch (err) {
    logger.error({ err }, 'startup migration failed, exiting');
    process.exit(1);
  }

  server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.env, gitSha: config.gitSha }, 'server listening');
  });
}

function shutdown(signal) {
  logger.info({ signal }, 'shutdown signal received, draining');
  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, config.shutdownTimeoutMs);

  if (!server) {
    clearTimeout(forceExit);
    process.exit(0);
    return;
  }

  server.close(async () => {
    try {
      await db.close();
    } catch (err) {
      logger.error({ err }, 'error closing db pool');
    } finally {
      clearTimeout(forceExit);
      logger.info('shutdown complete');
      process.exit(0);
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught exception, exiting');
  process.exit(1);
});

if (require.main === module) {
  start();
}

// Export the Express app itself (callable as a request handler) so
// serverless platforms that `require()` this file can invoke it directly;
// start/shutdown stay available as named properties for local/container use.
module.exports = app;
module.exports.start = start;
module.exports.shutdown = shutdown;

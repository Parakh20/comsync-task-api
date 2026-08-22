'use strict';

function requireEnv(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  databaseUrl: requireEnv('DATABASE_URL'),
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  dbConnectTimeoutMs: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10),
  shutdownTimeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10),
  gitSha: process.env.GIT_SHA || 'unknown',
};

module.exports = config;

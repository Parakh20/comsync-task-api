'use strict';

const pino = require('pino');
const config = require('./config');

const logger = pino({
  level: config.logLevel,
  base: { service: 'comsync-task-api', gitSha: config.gitSha },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;

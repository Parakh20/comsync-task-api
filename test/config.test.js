'use strict';

const test = require('node:test');
const assert = require('node:assert');

test('config throws when DATABASE_URL missing', () => {
  delete require.cache[require.resolve('../src/config')];
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  assert.throws(() => require('../src/config'), /DATABASE_URL/);
  if (original !== undefined) process.env.DATABASE_URL = original;
});

test('config loads with DATABASE_URL set', () => {
  delete require.cache[require.resolve('../src/config')];
  process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
  const config = require('../src/config');
  assert.strictEqual(typeof config.port, 'number');
});

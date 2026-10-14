'use strict';

// HTTP-level tests for the Express app.
// - Routes that never touch Postgres always run (DATABASE_URL points at a closed port).
// - Task CRUD tests run only when TEST_DATABASE_URL is set (CI provides a postgres
//   service container; locally: `docker compose up -d db` and export TEST_DATABASE_URL).

const test = require('node:test');
const assert = require('node:assert');

const testDbUrl = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL = testDbUrl || 'postgres://nobody:nothing@127.0.0.1:1/none';
process.env.DB_CONNECT_TIMEOUT_MS = '1000';
process.env.LOG_LEVEL = 'silent';

const app = require('../src/index');
const db = require('../src/db');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
});

function request(path, options = {}) {
  const headers = { accept: 'application/json', ...(options.headers || {}) };
  const init = { ...options, headers };
  if (options.json !== undefined) {
    init.body = JSON.stringify(options.json);
    init.headers['content-type'] = 'application/json';
  }
  return fetch(baseUrl + path, init);
}

test('GET /healthz returns ok without touching the database', async () => {
  const res = await request('/healthz');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
});

test('GET / returns JSON endpoint list for API clients', async () => {
  const res = await request('/');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.service, 'comsync-task-api');
  assert.ok(body.endpoints.includes('/api/tasks'));
});

test('GET / returns HTML landing page for browsers', async () => {
  const res = await request('/', { headers: { accept: 'text/html' } });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /comsync-task-api/);
});

test('GET /metrics exposes Prometheus counters', async () => {
  const res = await request('/metrics');
  assert.strictEqual(res.status, 200);
  assert.match(await res.text(), /http_requests_total/);
});

test('unknown route returns 404 JSON', async () => {
  const res = await request('/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.deepStrictEqual(await res.json(), { error: 'not found' });
});

test('GET /readyz returns 503 when the database is unreachable', { skip: Boolean(testDbUrl) && 'database is reachable in this run' }, async () => {
  const res = await request('/readyz');
  assert.strictEqual(res.status, 503);
  const body = await res.json();
  assert.strictEqual(body.status, 'not-ready');
});

const dbSkip = !testDbUrl && 'TEST_DATABASE_URL not set (needs a real Postgres)';

test('GET /readyz returns 200 when the database is reachable', { skip: dbSkip }, async () => {
  const res = await request('/readyz');
  assert.strictEqual(res.status, 200);
});

test('task CRUD lifecycle against Postgres', { skip: dbSkip }, async () => {
  const created = await request('/api/tasks', { method: 'POST', json: { title: '  write tests  ' } });
  assert.strictEqual(created.status, 201);
  const task = await created.json();
  assert.strictEqual(task.title, 'write tests');
  assert.strictEqual(task.done, false);

  const list = await request('/api/tasks');
  assert.strictEqual(list.status, 200);
  assert.ok((await list.json()).some((t) => t.id === task.id));

  const patched = await request(`/api/tasks/${task.id}`, { method: 'PATCH', json: { done: true } });
  assert.strictEqual(patched.status, 200);
  assert.strictEqual((await patched.json()).done, true);

  const deleted = await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
  assert.strictEqual(deleted.status, 204);

  const deletedAgain = await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
  assert.strictEqual(deletedAgain.status, 404);
});

test('task validation rejects bad input', { skip: dbSkip }, async () => {
  const noTitle = await request('/api/tasks', { method: 'POST', json: { title: '   ' } });
  assert.strictEqual(noTitle.status, 400);

  const badId = await request('/api/tasks/abc', { method: 'PATCH', json: { done: true } });
  assert.strictEqual(badId.status, 400);

  const badDone = await request('/api/tasks/1', { method: 'PATCH', json: { done: 'yes' } });
  assert.strictEqual(badDone.status, 400);

  const missing = await request('/api/tasks/999999999', { method: 'PATCH', json: { done: true } });
  assert.strictEqual(missing.status, 404);
});

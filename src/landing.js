'use strict';

function landingPage(gitSha) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>comsync-task-api</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; padding: 3rem 1.5rem; min-height: 100vh; box-sizing: border-box;
    background: #0b0e14; color: #e6e6e6;
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex; justify-content: center;
  }
  main { max-width: 640px; width: 100%; }
  h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
  .sub { color: #8b93a7; margin: 0 0 2rem; }
  .status { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #4ade80; margin-bottom: 2rem; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 6px #4ade80; }
  ul { list-style: none; padding: 0; margin: 0 0 2rem; border: 1px solid #232838; border-radius: 10px; overflow: hidden; }
  li { border-bottom: 1px solid #232838; }
  li:last-child { border-bottom: none; }
  a { display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.1rem;
      color: #e6e6e6; text-decoration: none; }
  a:hover { background: #131826; }
  code { color: #7dd3fc; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .desc { color: #8b93a7; font-size: 0.85rem; }
  footer { color: #5c6478; font-size: 0.8rem; }
  footer a { display: inline; padding: 0; color: #7dd3fc; }
</style>
</head>
<body>
<main>
  <h1>comsync-task-api</h1>
  <p class="sub">Small CRUD task API &mdash; containers, CI/CD, health checks, logging, monitoring, graceful shutdown, rollback.</p>
  <div class="status"><span class="dot"></span> service running &middot; build ${gitSha}</div>
  <ul>
    <li><a href="/healthz"><code>GET /healthz</code><span class="desc">liveness</span></a></li>
    <li><a href="/readyz"><code>GET /readyz</code><span class="desc">readiness (checks DB)</span></a></li>
    <li><a href="/metrics"><code>GET /metrics</code><span class="desc">Prometheus metrics</span></a></li>
    <li><a href="/api/tasks"><code>GET /api/tasks</code><span class="desc">list tasks</span></a></li>
  </ul>
  <footer>Source: <a href="https://github.com/Parakh20/comsync-task-api">github.com/Parakh20/comsync-task-api</a></footer>
</main>
</body>
</html>`;
}

module.exports = { landingPage };

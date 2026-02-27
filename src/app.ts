import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { metaSearch, parseEnginesParam, getEngineHealth, getGlobalSearchStats } from './searchService.js';
import type { EngineHealth } from './searchService.js';
import { engines } from './engines/index.js';
import { imageSearch } from './imageSearchService.js';
import { videoSearch } from './videoSearchService.js';
import { newsSearch } from './newsSearchService.js';

import type { Request, Response } from 'express';

export const app = express();
app.use(cors());

app.get('/images', (_req: Request, res: Response) => {
  const port = Number(process.env.PORT ?? 8787);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>🖼️ Görsel Arama Testi</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background: #0b1020; color: #e8eefc; }
      header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
      .sub { margin-top: 6px; color: rgba(232,238,252,0.72); font-size: 13px; }
      main { padding: 18px 24px 30px; max-width: 1400px; }
      .card { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.03); padding: 14px; margin-bottom: 12px; }
      label { display: block; font-size: 12px; color: rgba(232,238,252,0.75); margin-bottom: 6px; }
      input { border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.20); color: #e8eefc; padding: 8px 10px; border-radius: 10px; width: 100%; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      button { cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e8eefc; padding: 8px 10px; border-radius: 10px; }
      button:hover { background: rgba(255,255,255,0.09); }
      pre { margin: 0; padding: 12px; overflow: auto; background: rgba(0,0,0,0.25); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); }
      a { color: #9cc2ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .actions { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
      .results-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin-top: 20px; }
      .image-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; transition: all 0.3s; cursor: pointer; }
      .image-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); border-color: rgba(96,165,250,0.5); }
      .image-wrapper { width: 100%; height: 200px; background: rgba(0,0,0,0.3); position: relative; overflow: hidden; }
      .image-wrapper img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
      .image-info { padding: 14px; }
      .image-title { font-size: 13px; font-weight: 600; color: #e8eefc; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.4; }
      .image-meta { display: flex; gap: 12px; font-size: 11px; color: rgba(232,238,252,0.5); margin-top: 8px; }
      .source-badge { display: inline-block; background: rgba(96,165,250,0.2); color: #60a5fa; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; margin-top: 8px; }
      .loading { text-align: center; padding: 40px; color: rgba(232,238,252,0.6); }
      .error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 16px; color: #fca5a5; margin-bottom: 12px; }
      .stats-bar { display: flex; gap: 20px; margin-bottom: 12px; font-size: 13px; color: rgba(232,238,252,0.7); }
    </style>
  </head>
  <body>
    <header>
      <h1>Görsel Arama Testi</h1>
      <div class="sub">Running on <span>http://localhost:${port}</span> • <a href="/">Home</a> • <a href="/videos">Videos</a> • <a href="/news">News</a> • <a href="/status">Status</a> • <a href="/endpoint">API Docs</a></div>
    </header>
    <main>
      <div class="card">
        <label for="q">Search query</label>
        <input id="q" value="cats" />
        <label for="limit" style="margin-top: 10px;">Limit (max 200)</label>
        <input id="limit" value="50" type="number" />
        <div class="actions">
          <button id="runTest">Run Search</button>
        </div>
      </div>

      <div id="error" class="error" style="display: none;"></div>

      <div id="stats" class="stats-bar" style="display: none;">
        <span>Results: <strong id="count" style="color:#60a5fa;">0</strong></span>
        <span>Time: <strong id="time" style="color:#34d399;">-</strong></span>
      </div>

      <div id="loading" class="loading" style="display: none;">Searching...</div>

      <div id="results" class="results-grid"></div>

      <div class="card" id="jsonToggle" style="display: none; margin-top: 24px;">
        <div style="font-size: 13px; color: rgba(232,238,252,0.7); margin-bottom: 10px;">Raw JSON</div>
        <pre id="jsonData"></pre>
      </div>
    </main>
    <script>
      const el = (id) => document.getElementById(id);

      el('runTest').addEventListener('click', async () => {
        const q = el('q').value.trim();
        const limit = parseInt(el('limit').value) || 50;
        
        if (!q) {
          el('error').textContent = 'Lutfen bir arama sorgusu girin!';
          el('error').style.display = 'block';
          return;
        }

        el('error').style.display = 'none';
        el('stats').style.display = 'none';
        el('results').innerHTML = '';
        el('jsonToggle').style.display = 'none';
        el('loading').style.display = 'block';
        el('runTest').disabled = true;

        const startTime = Date.now();
        const url = '/search/images?q=' + encodeURIComponent(q) + '&limitTotal=' + limit + '&cache=1';

        try {
          const r = await fetch(url);
          const j = await r.json();
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          
          el('loading').style.display = 'none';
          
          if (j.results && j.results.length > 0) {
            el('stats').style.display = 'flex';
            el('count').textContent = j.count || j.results.length;
            el('time').textContent = duration + 's';

            j.results.forEach((img, idx) => {
              const card = document.createElement('div');
              card.className = 'image-card';
              card.innerHTML = \`
                <div class="image-wrapper">
                  <img src="\${img.thumbnail || img.url}" alt="\${img.title}" loading="lazy" 
                       onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22280%22 height=%22200%22%3E%3Crect fill=%22%23374151%22 width=%22280%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 fill=%22%239ca3af%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'" />
                </div>
                <div class="image-info">
                  <div class="image-title">\${img.title}</div>
                  <div class="image-meta">
                    \${img.width && img.height ? \`<span>\${img.width}×\${img.height}</span>\` : ''}
                    <span>#\${idx + 1}</span>
                  </div>
                  \${img.source ? \`<div class="source-badge">\${img.source}</div>\` : ''}
                </div>
              \`;
              card.onclick = () => window.open(img.url, '_blank');
              el('results').appendChild(card);
            });

            el('jsonToggle').style.display = 'block';
            el('jsonData').textContent = JSON.stringify(j, null, 2);
          } else {
            el('results').innerHTML = '<div class="loading">😕 Sonuç bulunamadı.</div>';
          }
        } catch (e) {
          el('loading').style.display = 'none';
          el('error').textContent = 'Hata: ' + String(e);
          el('error').style.display = 'block';
        } finally {
          el('runTest').disabled = false;
        }
      });

      el('q').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') el('runTest').click();
      });
    </script>
  </body>
</html>`);
});

app.get('/videos', (_req: Request, res: Response) => {
  const port = Number(process.env.PORT ?? 8787);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Video Search Test</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background: #0b1020; color: #e8eefc; }
      header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
      .sub { margin-top: 6px; color: rgba(232,238,252,0.72); font-size: 13px; }
      main { padding: 18px 24px 30px; max-width: 1100px; }
      .card { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.03); padding: 14px; margin-bottom: 12px; }
      label { display: block; font-size: 12px; color: rgba(232,238,252,0.75); margin-bottom: 6px; }
      input { border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.20); color: #e8eefc; padding: 8px 10px; border-radius: 10px; width: 100%; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      button { cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e8eefc; padding: 8px 10px; border-radius: 10px; }
      button:hover { background: rgba(255,255,255,0.09); }
      pre { margin: 0; padding: 12px; overflow: auto; background: rgba(0,0,0,0.25); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); max-height: 500px; }
      a { color: #9cc2ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .actions { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
    </style>
  </head>
  <body>
    <header>
      <h1>Video Search Test</h1>
      <div class="sub">Running on <span>http://localhost:${port}</span> • <a href="/">Home</a> • <a href="/images">Images</a> • <a href="/news">News</a> • <a href="/endpoint">API Docs</a></div>
    </header>
    <main>
      <div class="card">
        <label for="q">Search query</label>
        <input id="q" value="typescript tutorial" />
        <label for="limit" style="margin-top: 10px;">Limit (max 100)</label>
        <input id="limit" value="30" type="number" />
        <div class="actions">
          <button id="runTest">Run /search/videos test</button>
        </div>
      </div>
      <div class="card">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: rgba(232,238,252,0.75); font-size: 13px;">Results</span>
          <span id="statusTime" style="color: rgba(232,238,252,0.75); font-size: 13px;">-</span>
        </div>
        <pre id="results">Click "Run test" to see results...</pre>
      </div>
    </main>
    <script>
      const el = (id) => document.getElementById(id);
      el('runTest').addEventListener('click', async () => {
        const q = encodeURIComponent(el('q').value || '');
        const limit = encodeURIComponent(el('limit').value || '30');
        const url = '/search/videos?q=' + q + '&limitTotal=' + limit + '&cache=1';
        try {
          el('results').textContent = 'Loading...';
          const r = await fetch(url);
          const j = await r.json();
          el('statusTime').textContent = new Date().toLocaleTimeString();
          el('results').textContent = JSON.stringify(j, null, 2);
        } catch (e) {
          el('results').textContent = String(e);
        }
      });
    </script>
  </body>
</html>`);
});

app.get('/news', (_req: Request, res: Response) => {
  const port = Number(process.env.PORT ?? 8787);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>News Search Test</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background: #0b1020; color: #e8eefc; }
      header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
      .sub { margin-top: 6px; color: rgba(232,238,252,0.72); font-size: 13px; }
      main { padding: 18px 24px 30px; max-width: 1100px; }
      .card { border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.03); padding: 14px; margin-bottom: 12px; }
      label { display: block; font-size: 12px; color: rgba(232,238,252,0.75); margin-bottom: 6px; }
      input { border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.20); color: #e8eefc; padding: 8px 10px; border-radius: 10px; width: 100%; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      button { cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e8eefc; padding: 8px 10px; border-radius: 10px; }
      button:hover { background: rgba(255,255,255,0.09); }
      pre { margin: 0; padding: 12px; overflow: auto; background: rgba(0,0,0,0.25); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); max-height: 500px; }
      a { color: #9cc2ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .actions { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
    </style>
  </head>
  <body>
    <header>
      <h1>News Search Test</h1>
      <div class="sub">Running on <span>http://localhost:${port}</span> • <a href="/">Home</a> • <a href="/images">Images</a> • <a href="/videos">Videos</a> • <a href="/endpoint">API Docs</a></div>
    </header>
    <main>
      <div class="card">
        <label for="q">Search query</label>
        <input id="q" value="artificial intelligence" />
        <label for="limit" style="margin-top: 10px;">Limit (max 100)</label>
        <input id="limit" value="30" type="number" />
        <div class="actions">
          <button id="runTest">Run /search/news test</button>
        </div>
      </div>
      <div class="card">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: rgba(232,238,252,0.75); font-size: 13px;">Results</span>
          <span id="statusTime" style="color: rgba(232,238,252,0.75); font-size: 13px;">-</span>
        </div>
        <pre id="results">Click "Run test" to see results...</pre>
      </div>
    </main>
    <script>
      const el = (id) => document.getElementById(id);
      el('runTest').addEventListener('click', async () => {
        const q = encodeURIComponent(el('q').value || '');
        const limit = encodeURIComponent(el('limit').value || '30');
        const url = '/search/news?q=' + q + '&limitTotal=' + limit + '&cache=1';
        try {
          el('results').textContent = 'Loading...';
          const r = await fetch(url);
          const j = await r.json();
          el('statusTime').textContent = new Date().toLocaleTimeString();
          el('results').textContent = JSON.stringify(j, null, 2);
        } catch (e) {
          el('results').textContent = String(e);
        }
      });
    </script>
  </body>
</html>`);
});


app.get('/', (_req: Request, res: Response) => {
  const port = Number(process.env.PORT ?? 8787);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ArtadoProxy Status</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background: #0b1020; color: #e8eefc; }
      header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
      .sub { margin-top: 6px; color: rgba(232,238,252,0.72); font-size: 13px; }
      main { padding: 18px 24px 30px; max-width: 1100px; }
      .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
      .card { grid-column: span 12; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.03); padding: 14px; }
      @media (min-width: 900px) { .card.half { grid-column: span 6; } }
      @media (min-width: 1200px) { .card.third { grid-column: span 4; } }
      .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .row:last-child { border-bottom: none; }
      .k { color: rgba(232,238,252,0.75); font-size: 13px; }
      .v { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: #ffffff; text-align: right; }
      pre { margin: 0; padding: 12px; overflow: auto; background: rgba(0,0,0,0.25); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); }
      a { color: #9cc2ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.04); font-size: 12px; }
      .dot { width: 8px; height: 8px; border-radius: 999px; background: #ffd166; }
      .dot.ok { background: #46d39a; }
      .dot.err { background: #ff5c7a; }
      .actions { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
      button { cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e8eefc; padding: 8px 10px; border-radius: 10px; }
      button:hover { background: rgba(255,255,255,0.09); }
      input { border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.20); color: #e8eefc; padding: 8px 10px; border-radius: 10px; width: 100%; box-sizing: border-box; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      label { display: block; font-size: 12px; color: rgba(232,238,252,0.75); margin-bottom: 6px; }
      .two { display: grid; grid-template-columns: 1fr; gap: 10px; }
      @media (min-width: 900px) { .two { grid-template-columns: 1fr 1fr; } }
      .health-item { margin-top: 8px; font-size: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; word-break: break-all; overflow-wrap: break-word; }
      .health-item.fail { border-left: 3px solid #ff5c7a; }
      .health-item.ok { border-left: 3px solid #46d39a; }
    </style>
  </head>
  <body>
    <header>
      <h1>ArtadoProxy Status</h1>
      <div class="sub">Running on <span class="v">http://localhost:${port}</span> • <a href="/status">/status</a> • <a href="/health">/health</a> • <a href="/images">Images</a> • <a href="/videos">Videos</a> • <a href="/news">News</a> • <a href="/endpoint">API Docs</a></div>
    </header>
    <main>
      <div class="grid">
        <section class="card half">
          <div class="row"><div class="k">Service</div><div class="v">proxy</div></div>
          <div class="row"><div class="k">Version</div><div class="v" id="ver">-</div></div>
          <div class="row"><div class="k">Uptime</div><div class="v" id="uptime">-</div></div>
          <div class="row"><div class="k">Engines</div><div class="v" id="engines">-</div></div>
          <div class="actions">
            <button id="refresh">Refresh</button>
          </div>
        </section>

        <section class="card half">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="badge" id="healthBadge"><span class="dot" id="healthDot"></span><span id="healthText">Checking /health...</span></div>
            <a class="badge" href="#" id="openSearch" style="border-radius: 10px; border-color: rgba(70, 211, 154, 0.3); background: rgba(70, 211, 154, 0.05);">
              <span class="dot ok"></span><span>Run Test Search</span>
            </a>
          </div>
          
          <div style="margin-top: 20px;">
            <label style="margin-bottom: 12px; opacity: 0.6; font-size: 11px;">System Health Overview</label>
            <div class="row"><div class="k">Memory (RSS)</div><div class="v" id="memRss">-</div></div>
            <div class="row"><div class="k">Heap Used</div><div class="v" id="memHeap">-</div></div>
            <div class="row"><div class="k">Process ID</div><div class="v" id="pid">-</div></div>
          </div>
        </section>

        <section class="card" id="engineHealthCard" style="display:none;">
          <h3 style="margin-top:0; font-size:14px; color:rgba(232,238,252,0.8);">Engine Health / Failures</h3>
          <div id="engineHealthList"></div>
        </section>

        <section class="card">
          <div class="row"><div class="k">/status JSON</div><div class="v" id="statusTime">-</div></div>
          <pre id="status">Loading...</pre>
        </section>
      </div>
    </main>
    <script>
      const el = (id) => document.getElementById(id);
      
      async function load() {
        try {
          const statusRes = await fetch('/status');
          const status = await statusRes.json();
          el('ver').textContent = status?.runtime?.node ?? '-';
          el('uptime').textContent = status?.runtime?.uptimeSec != null ? String(status.runtime.uptimeSec) + 's' : '-';
          el('engines').textContent = Array.isArray(status?.engines?.supported) ? status.engines.supported.join(', ') : '-';
          el('statusTime').textContent = new Date().toLocaleTimeString();
          el('status').textContent = JSON.stringify(status, null, 2);
          
          // Populate new health fields
          el('memRss').textContent = (status?.memory?.rss / 1024 / 1024).toFixed(1) + ' MB';
          el('memHeap').textContent = (status?.memory?.heapUsed / 1024 / 1024).toFixed(1) + ' MB';
          el('pid').textContent = status?.runtime?.pid ?? '-';

          const healthRes = await fetch('/api/health');
          const healthData = await healthRes.json();
          const healthOk = healthRes.ok && healthData.ok;
          el('healthDot').className = 'dot ' + (healthOk ? 'ok' : 'err');
          el('healthText').textContent = healthOk ? 'Healthy' : 'Unhealthy';

          // Engine Health UI
          if (status.engines && status.engines.health) {
            const list = el('engineHealthList');
            list.innerHTML = '';
            let showCount = 0;
            
            for (const [id, h] of Object.entries(status.engines.health)) {
              if (h.totalRequests === 0 && !h.lastError) continue;
              
              showCount++;
              const div = document.createElement('div');
              div.className = 'health-item ' + (h.totalErrors > 0 && h.lastError > (h.lastSuccess || '') ? 'fail' : 'ok');
              
              div.innerHTML = \`
                <div style="display:flex; justify-content:space-between;">
                  <strong>\${id}</strong>
                  <span>req: \${h.totalRequests} | err: \${h.totalErrors}</span>
                </div>
                \${h.lastErrorMessage ? \`<div style="color:#ff5c7a; margin-top:4px; font-size:11px;">Error: \${h.lastErrorMessage}</div>\` : ''}
                <div style="font-size:10px; color:rgba(232,238,252,0.5); margin-top:4px;">
                  \${h.lastSuccess ? \`Last OK: \${new Date(h.lastSuccess).toLocaleTimeString()}\` : 'Never succeeded'}
                  \${h.lastError ? \` | Last Fail: \${new Date(h.lastError).toLocaleTimeString()}\` : ''}
                </div>
              \`;
              list.appendChild(div);
            }
            
            el('engineHealthCard').style.display = showCount > 0 ? 'block' : 'none';
          }

        } catch (e) {
          el('healthDot').className = 'dot err';
          el('healthText').textContent = 'Failed to load status';
          el('status').textContent = String(e);
        }
      }

      el('refresh').addEventListener('click', load);

      function syncOpenSearchLink() {
        const url = '/search?q=artado&limitTotal=20&limitPerEngine=5&timeoutMs=20000&cache=1';
        el('openSearch').setAttribute('href', url);
      }

      syncOpenSearchLink();

      load();
    </script>
  </body>
</html>`);
});

app.get('/status', (_req: Request, res: Response) => {
  const supported = engines.map((e) => e.id);
  const health = getEngineHealth();
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    service: 'proxy',
    now: new Date().toISOString(),
    runtime: {
      node: process.version,
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      uptimeSec: Math.floor(process.uptime())
    },
    engines: {
      supported,
      health
    },
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external
    }
  });
});

app.get('/health', (_req: Request, res: Response) => {
  const port = Number(process.env.PORT ?? 8787);
  const health = getEngineHealth();
  const globalStats = getGlobalSearchStats();
  const allEnginesCount = engines.length; // Total available engines
  const failedEngines = Object.entries(health).filter(([_, h]) => h.totalErrors > 0 && h.lastError! > (h.lastSuccess || '')).length;
  const mem = process.memoryUsage();

  // Consider unhealthy if more than 50% of engines are failing
  const ok = allEnginesCount > 0 ? (failedEngines / allEnginesCount < 0.5) : true;

  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sağlık Durumu - ArtadoProxy</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background: #0b1020; color: #e8eefc; }
      header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
      .sub { margin-top: 6px; color: rgba(232,238,252,0.72); font-size: 13px; }
      main { padding: 18px 24px 30px; max-width: 1100px; }
      .grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
      .card { grid-column: span 12; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; background: rgba(255,255,255,0.03); padding: 14px; }
      @media (min-width: 900px) { .card.half { grid-column: span 6; } }
      @media (min-width: 1200px) { .card.third { grid-column: span 4; } }
      .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .row:last-child { border-bottom: none; }
      .k { color: rgba(232,238,252,0.75); font-size: 13px; }
      .v { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; color: #ffffff; text-align: right; }
      pre { margin: 0; padding: 12px; overflow: auto; background: rgba(0,0,0,0.25); border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); }
      a { color: #9cc2ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.04); font-size: 12px; }
      .dot { width: 8px; height: 8px; border-radius: 999px; background: #ffd166; }
      .dot.ok { background: #46d39a; }
      .dot.err { background: #ff5c7a; }
      .dot.warn { background: #ffa726; }
      .actions { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
      button { cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: #e8eefc; padding: 8px 10px; border-radius: 10px; }
      button:hover { background: rgba(255,255,255,0.09); }
      .health-item { margin-top: 8px; font-size: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; word-break: break-all; overflow-wrap: break-word; }
      .health-item.fail { border-left: 3px solid #ff5c7a; }
      .health-item.ok { border-left: 3px solid #46d39a; }
      .health-item.warn { border-left: 3px solid #ffa726; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 12px; }
      .stat-card { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; text-align: center; }
      .stat-value { font-size: 24px; font-weight: 700; color: #60a5fa; margin-bottom: 4px; }
      .stat-label { font-size: 11px; color: rgba(232,238,252,0.6); text-transform: uppercase; letter-spacing: 0.5px; }
      .progress-bar { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin-top: 8px; }
      .progress-fill { height: 100%; background: linear-gradient(90deg, #46d39a 0%, #60a5fa 100%); transition: width 0.3s ease; }
      .progress-fill.warn { background: linear-gradient(90deg, #ffa726 0%, #ff9800 100%); }
      .progress-fill.err { background: linear-gradient(90deg, #ff5c7a 0%, #ef4444 100%); }
      .error-details { margin-top: 8px; padding: 8px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; font-size: 11px; color: #fca5a5; }
      .timestamp { font-size: 10px; color: rgba(232,238,252,0.5); margin-top: 4px; }
      .filter-buttons { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
      .filter-btn { padding: 4px 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); border-radius: 6px; font-size: 11px; cursor: pointer; transition: all 0.2s; }
      .filter-btn:hover { background: rgba(255,255,255,0.1); }
      .filter-btn.active { background: rgba(96,165,250,0.2); border-color: #60a5fa; color: #60a5fa; }
      .hidden { display: none; }
      .engine-details { background: rgba(0,0,0,0.15); border-radius: 8px; padding: 12px; margin-top: 8px; }
      .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
      .metric-item { background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; text-align: center; }
      .metric-value { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
      .metric-label { font-size: 9px; color: rgba(232,238,252,0.5); text-transform: uppercase; }
      .query-list { max-height: 200px; overflow-y: auto; }
      .query-item { padding: 4px 8px; margin: 2px 0; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 11px; display: flex; justify-content: space-between; }
      .query-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .query-count { color: #60a5fa; font-weight: 600; margin-left: 8px; }
    </style>
  </head>
  <body>
    <header>
      <h1>Sağlık Durumu</h1>
      <div class="sub">Running on <span class="v">http://localhost:${port}</span> • <a href="/">Ana Sayfa</a> • <a href="/status">/status</a> • <a href="/images">Görseller</a> • <a href="/videos">Videolar</a> • <a href="/news">Haberler</a></div>
    </header>
    <main>
      <div class="grid">
        <section class="card third">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div class="badge"><span class="dot ${ok ? 'ok' : 'err'}"></span><span>${ok ? 'Sağlıklı' : 'Sağlıksız'}</span></div>
            <button id="refresh">Yenile</button>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${allEnginesCount}</div>
              <div class="stat-label">Toplam Motor</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: ${failedEngines === 0 ? '#46d39a' : failedEngines < allEnginesCount / 2 ? '#ffa726' : '#ff5c7a'}">${failedEngines}</div>
              <div class="stat-label">Hatalı Motor</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #46d39a;">${allEnginesCount - failedEngines}</div>
              <div class="stat-label">Çalışan Motor</div>
            </div>
          </div>

          <div style="margin-top: 16px;">
            <div class="progress-bar">
              <div class="progress-fill ${allEnginesCount - failedEngines === allEnginesCount ? '' : failedEngines < allEnginesCount / 2 ? 'warn' : 'err'}" style="width: ${allEnginesCount > 0 ? ((allEnginesCount - failedEngines) / allEnginesCount * 100) : 0}%"></div>
            </div>
            <div style="font-size: 11px; color: rgba(232,238,252,0.6); margin-top: 4px;">Başarı Oranı: ${allEnginesCount > 0 ? Math.round((allEnginesCount - failedEngines) / allEnginesCount * 100) : 0}%</div>
          </div>
        </section>

        <section class="card third">
          <h3 style="margin-top:0; font-size:14px; color:rgba(232,238,252,0.8); margin-bottom: 16px;">Arama İstatistikleri</h3>
          <div class="metric-grid">
            <div class="metric-item">
              <div class="metric-value" style="color: #60a5fa;">${globalStats.totalSearches}</div>
              <div class="metric-label">Toplam Arama</div>
            </div>
            <div class="metric-item">
              <div class="metric-value" style="color: #46d39a;">${globalStats.totalResults}</div>
              <div class="metric-label">Toplam Sonuç</div>
            </div>
            <div class="metric-item">
              <div class="metric-value" style="color: #ff5c7a;">${globalStats.totalErrors}</div>
              <div class="metric-label">Toplam Hata</div>
            </div>
            <div class="metric-item">
              <div class="metric-value" style="color: #ffa726;">${globalStats.avgResponseTime.toFixed(0)}ms</div>
              <div class="metric-label">Ortalama Süre</div>
            </div>
          </div>
        </section>

        <section class="card third">
          <h3 style="margin-top:0; font-size:14px; color:rgba(232,238,252,0.8); margin-bottom: 16px;">Sistem Kaynakları</h3>
          <div class="row"><div class="k">Memory (RSS)</div><div class="v">${(mem.rss / 1024 / 1024).toFixed(1)} MB</div></div>
          <div class="row"><div class="k">Heap Used</div><div class="v">${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB</div></div>
          <div class="row"><div class="k">Process ID</div><div class="v">${process.pid}</div></div>
          <div class="row"><div class="k">Node Version</div><div class="v">${process.version}</div></div>
          <div class="row"><div class="k">Uptime</div><div class="v">${Math.floor(process.uptime())}s</div></div>
        </section>

        <section class="card half">
          <h3 style="margin-top:0; font-size:14px; color:rgba(232,238,252,0.8); margin-bottom: 12px;">Arama İstatistikleri</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #60a5fa; margin-bottom: 4px;">${globalStats.totalSearches}</div>
              <div style="font-size: 11px; color: rgba(232,238,252,0.6); text-transform: uppercase; letter-spacing: 0.5px;">Toplam Arama</div>
            </div>
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #46d39a; margin-bottom: 4px;">${globalStats.totalResults}</div>
              <div style="font-size: 11px; color: rgba(232,238,252,0.6); text-transform: uppercase; letter-spacing: 0.5px;">Toplam Sonuç</div>
            </div>
          </div>
        </section>

        <section class="card">
          <h3 style="margin-top:0; font-size:14px; color:rgba(232,238,252,0.8); margin-bottom: 12px;">Detaylı Motor Analizi</h3>
          
          <div class="filter-buttons">
            <button class="filter-btn active" data-filter="all">Tümü (${allEnginesCount})</button>
            <button class="filter-btn" data-filter="healthy">Sağlıklı (${allEnginesCount - failedEngines})</button>
            <button class="filter-btn" data-filter="unhealthy">Hatalı (${failedEngines})</button>
            <button class="filter-btn" data-filter="never">Hiç Çalışmamış</button>
          </div>

          <div id="engineHealthList"></div>
        </section>

        <section class="card">
          <h3 style="margin-top:0; font-size:14px; color:rgba(232,238,252,0.8); margin-bottom: 12px;">Ham Sağlık Verisi</h3>
          <div class="row"><div class="k">Son Güncelleme</div><div class="v" id="lastUpdate">-</div></div>
          <pre id="healthJson">Yükleniyor...</pre>
        </section>
      </div>
    </main>
    <script>
      const el = (id) => document.getElementById(id);
      const healthData = JSON.parse('${JSON.stringify({ ok, allEnginesCount: allEnginesCount, failedEngines, details: failedEngines > 0 ? 'Some engines are failing' : 'All systems normal', health }).replace(/'/g, "\\'")}');
      
      function getEngineStatus(engine) {
        const h = healthData.health[engine];
        if (!h) return 'never';
        if (h.totalErrors > 0 && h.lastError > (h.lastSuccess || '')) return 'unhealthy';
        if (h.totalRequests > 0) return 'healthy';
        return 'never';
      }

      function renderEngines(filter = 'all') {
        const list = el('engineHealthList');
        list.innerHTML = '';
        
        const engines = Object.keys(healthData.health).sort((a, b) => {
          const statusA = getEngineStatus(a);
          const statusB = getEngineStatus(b);
          const priority = { 'unhealthy': 0, 'never': 1, 'healthy': 2 };
          return priority[statusA] - priority[statusB];
        });

        if (engines.length === 0) {
          list.innerHTML = '<div style="color: rgba(232,238,252,0.5); font-size: 12px; text-align: center; padding: 20px;">Henüz motor verisi bulunmuyor. Arama yaparak motorları test edin.</div>';
          return;
        }

        engines.forEach(engine => {
          const h = healthData.health[engine];
          const status = getEngineStatus(engine);
          
          if (filter !== 'all' && status !== filter) return;

          const div = document.createElement('div');
          div.className = 'health-item ' + (status === 'unhealthy' ? 'fail' : status === 'healthy' ? 'ok' : 'warn');
          
          const errorRate = h.totalRequests > 0 ? (h.totalErrors / h.totalRequests * 100).toFixed(1) : 0;
          const successRate = h.totalRequests > 0 ? (100 - errorRate).toFixed(1) : 0;
          
          div.innerHTML = \`
            <div style="display:flex; justify-content:space-between; align-items: center; margin-bottom: 12px;">
              <strong style="font-size: 14px;">\${engine}</strong>
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="font-size: 11px; color: rgba(232,238,252,0.6);">
                  \${h.totalRequests} istek
                </span>
                <span class="dot" style="background: \${status === 'unhealthy' ? '#ff5c7a' : status === 'healthy' ? '#46d39a' : '#ffa726'}"></span>
                <span style="font-size: 11px; font-weight: 600; color: \${status === 'unhealthy' ? '#ff5c7a' : status === 'healthy' ? '#46d39a' : '#ffa726'};">
                  \${status === 'unhealthy' ? 'Hatalı' : status === 'healthy' ? 'Sağlıklı' : 'Test Edilmemiş'}
                </span>
              </div>
            </div>
            
            \${h.totalRequests > 0 ? \`
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
                  <div style="font-size: 10px; color: rgba(232,238,252,0.5); margin-bottom: 2px;">Başarılı İstekler</div>
                  <div style="font-size: 16px; font-weight: 600; color: #46d39a;">\${h.totalRequests - h.totalErrors}</div>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
                  <div style="font-size: 10px; color: rgba(232,238,252,0.5); margin-bottom: 2px;">Başarısız İstekler</div>
                  <div style="font-size: 16px; font-weight: 600; color: #ff5c7a;">\${h.totalErrors}</div>
                </div>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
                  <div style="font-size: 10px; color: rgba(232,238,252,0.5); margin-bottom: 2px;">Toplam Sonuç</div>
                  <div style="font-size: 16px; font-weight: 600; color: #60a5fa;">\${h.totalResults || 0}</div>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
                  <div style="font-size: 10px; color: rgba(232,238,252,0.5); margin-bottom: 2px;">Ortalama Süre</div>
                  <div style="font-size: 16px; font-weight: 600; color: #ffa726;">\${(h.avgResponseTime || 0).toFixed(0)}ms</div>
                </div>
              </div>
              
              <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                  <span style="color: #46d39a;">Başarı Oranı: \${successRate}%</span>
                  <span style="color: #ff5c7a;">Hata Oranı: \${errorRate}%</span>
                </div>
                <div class="progress-bar" style="height: 6px;">
                  <div class="progress-fill \${errorRate > 50 ? 'err' : errorRate > 10 ? 'warn' : ''}" style="width: \${successRate}%"></div>
                </div>
              </div>
            \` : \`
              <div style="background: rgba(255,167,38,0.1); border: 1px solid rgba(255,167,38,0.3); border-radius: 6px; padding: 8px; margin-bottom: 12px;">
                <div style="font-size: 11px; color: #ffa726;">Bu motor henüz test edilmedi</div>
              </div>
            \`}
            
            \${h.lastErrorMessage ? \`
              <div class="error-details" style="margin-bottom: 12px;">
                <div style="font-weight: 600; margin-bottom: 4px;">Son Hata Mesajı:</div>
                <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break: break-all;">\${h.lastErrorMessage}</div>
              </div>
            \` : ''}
            
            <div style="background: rgba(0,0,0,0.15); border-radius: 6px; padding: 8px;">
              <div style="font-size: 10px; color: rgba(232,238,252,0.5); margin-bottom: 6px;">Zaman Bilgileri</div>
              <div style="font-size: 11px; line-height: 1.4;">
                \${h.lastSuccess ? \`
                  <div style="color: #46d39a; margin-bottom: 2px;">
                    Son Başarı: \${new Date(h.lastSuccess).toLocaleString('tr-TR')}
                  </div>
                \` : '<div style="color: #ffa726; margin-bottom: 2px;">Hiç başarılı işlem olmadı</div>'}
                \${h.lastError ? \`
                  <div style="color: #ff5c7a; margin-bottom: 2px;">
                    Son Hata: \${new Date(h.lastError).toLocaleString('tr-TR')}
                  </div>
                \` : ''}
                \${h.lastSuccess && h.lastError ? \`
                  <div style="color: rgba(232,238,252,0.5); margin-top: 4px;">
                    Son durum değişikliği: \${Math.abs(new Date(h.lastError) - new Date(h.lastSuccess)) / 1000 / 60} dakika önce
                  </div>
                \` : ''}
              </div>
            </div>
          \`;
          list.appendChild(div);
        });

        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.filter === filter);
        });
      }

      function updateData() {
        el('lastUpdate').textContent = new Date().toLocaleString('tr-TR');
        el('healthJson').textContent = JSON.stringify(healthData, null, 2);
        renderEngines();
      }

      // Add filter button handlers when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => renderEngines(btn.dataset.filter));
          });
        });
      } else {
        document.querySelectorAll('.filter-btn').forEach(btn => {
          btn.addEventListener('click', () => renderEngines(btn.dataset.filter));
        });
      }

      document.getElementById('refresh').addEventListener('click', () => {
        window.location.reload();
      });

      // Auto-refresh every 30 seconds
      setInterval(() => {
        window.location.reload();
      }, 30000);

      updateData();
    </script>
  </body>
</html>`);
});

// API endpoint for JSON health data (for homepage compatibility)
app.get('/api/health', (_req: Request, res: Response) => {
  const health = getEngineHealth();
  const allEnginesCount = engines.length; // Total available engines
  const failedEngines = Object.entries(health).filter(([_, h]) => h.totalErrors > 0 && h.lastError! > (h.lastSuccess || '')).length;

  // Consider unhealthy if more than 50% of engines are failing
  const ok = allEnginesCount > 0 ? (failedEngines / allEnginesCount < 0.5) : true;

  res.status(ok ? 200 : 503).json({
    ok,
    allEnginesCount,
    failedEngines,
    details: failedEngines > 0 ? 'Some engines are failing' : 'All systems normal'
  });
});






app.get('/search', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const engines = parseEnginesParam(typeof req.query.engines === 'string' ? req.query.engines : undefined);
  const limitTotal = Math.max(1, Math.min(200, Number(req.query.limitTotal ?? 20)));
  const limitPerEngine = Math.max(1, Math.min(20, Number(req.query.limitPerEngine ?? 5)));
  const useCache = !(String(req.query.cache ?? '1') === '0');
  const region = typeof req.query.region === 'string' ? req.query.region.trim() : undefined;
  const includeDomains = typeof req.query.includeDomains === 'string' ? req.query.includeDomains : undefined;
  const excludeDomains = typeof req.query.excludeDomains === 'string' ? req.query.excludeDomains : undefined;

  let pageno = Number(req.query.pageno ?? 1);
  const offset = Number(req.query.offset);
  if (!isNaN(offset) && req.query.offset !== undefined) {
    pageno = offset + 1;
  }
  pageno = Math.max(1, pageno);

  if (!q) {
    res.status(400).json({ error: 'missing q' });
    return;
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Math.min(30000, Number(req.query.timeoutMs ?? 12000)));
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { results, errors } = await metaSearch({
      query: q,
      engines,
      limitPerEngine,
      limitTotal,
      includeDomains,
      excludeDomains,
      useCache,
      signal: controller.signal,
      region,
      pageno
    });
    res.json({
      query: q,
      engines,
      limitTotal,
      limitPerEngine,
      pageno,
      count: results.length,
      results,
      errors
    });
  } finally {
    clearTimeout(t);
  }
});

app.get('/search/images', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitTotal = Math.max(1, Math.min(200, Number(req.query.limitTotal ?? 50)));
  const useCache = !(String(req.query.cache ?? '1') === '0');

  let pageno = Number(req.query.pageno ?? 1);
  const offset = Number(req.query.offset);
  if (!isNaN(offset) && req.query.offset !== undefined) {
    pageno = offset + 1;
  }
  pageno = Math.max(1, pageno);

  if (!q) {
    res.status(400).json({ error: 'missing q' });
    return;
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Math.min(30000, Number(req.query.timeoutMs ?? 12000)));
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { results } = await imageSearch({
      query: q,
      limitTotal,
      useCache,
      signal: controller.signal,
      pageno
    });
    res.json({
      query: q,
      pageno,
      count: results.length,
      results
    });
  } finally {
    clearTimeout(t);
  }
});

app.get('/search/videos', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitTotal = Math.max(1, Math.min(100, Number(req.query.limitTotal ?? 30)));
  const useCache = !(String(req.query.cache ?? '1') === '0');

  let pageno = Number(req.query.pageno ?? 1);
  const offset = Number(req.query.offset);
  if (!isNaN(offset) && req.query.offset !== undefined) {
    pageno = offset + 1;
  }
  pageno = Math.max(1, pageno);

  if (!q) {
    res.status(400).json({ error: 'missing q' });
    return;
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Math.min(30000, Number(req.query.timeoutMs ?? 12000)));
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { results } = await videoSearch({
      query: q,
      limitTotal,
      useCache,
      signal: controller.signal,
      pageno
    });
    res.json({
      query: q,
      pageno,
      count: results.length,
      results
    });
  } finally {
    clearTimeout(t);
  }
});

app.get('/search/news', async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitTotal = Math.max(1, Math.min(100, Number(req.query.limitTotal ?? 30)));
  const useCache = !(String(req.query.cache ?? '1') === '0');

  let pageno = Number(req.query.pageno ?? 1);
  const offset = Number(req.query.offset);
  if (!isNaN(offset) && req.query.offset !== undefined) {
    pageno = offset + 1;
  }
  pageno = Math.max(1, pageno);

  if (!q) {
    res.status(400).json({ error: 'missing q' });
    return;
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Math.min(30000, Number(req.query.timeoutMs ?? 12000)));
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { results } = await newsSearch({
      query: q,
      limitTotal,
      useCache,
      signal: controller.signal,
      pageno
    });
    res.json({
      query: q,
      pageno,
      count: results.length,
      results
    });
  } finally {
    clearTimeout(t);
  }
});

app.get('/endpoint', (_req: Request, res: Response) => {
  const port = Number(process.env.PORT ?? 8787);
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Documentation - ArtadoProxy</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; background: #0b1020; color: #e8eefc; }
      header { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
      h1 { margin: 0; font-size: 18px; font-weight: 650; letter-spacing: 0.2px; }
      .sub { margin-top: 6px; color: rgba(232,238,252,0.72); font-size: 13px; }
      main { padding: 18px 24px 30px; max-width: 1400px; }
      .section { margin-bottom: 32px; }
      h2 { font-size: 16px; font-weight: 600; margin: 0 0 12px 0; color: #9cc2ff; }
      h3 { font-size: 14px; font-weight: 600; margin: 16px 0 8px 0; color: #e8eefc; }
      code { background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
      pre { background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      th, td { padding: 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; }
      th { color: #9cc2ff; font-weight: 600; }
      tr:hover { background: rgba(255,255,255,0.02); }
      .endpoint { background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.3); border-radius: 8px; padding: 16px; margin: 12px 0; }
      .method { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-right: 8px; }
      .get { background: rgba(70,211,154,0.2); color: #46d39a; }
      .badge { display: inline-block; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 4px 8px; border-radius: 6px; font-size: 11px; margin: 2px; }
      a { color: #9cc2ff; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <header>
      <h1>API Documentation</h1>
      <div class="sub">Running on <span class="v">http://localhost:${port}</span> • <a href="/">Home</a> • <a href="/status">/status</a> • <a href="/health">/health</a></div>
    </header>
    <main>
      <div class="section">
        <h2>Genel Bilgi</h2>
        <p>ArtadoProxy, birden fazla arama motorundan sonuçları bir araya getiren yüksek performanslı bir meta-arama servisi. Tüm API endpoint'leri JSON formatında yanıt döner.</p>
      </div>

      <div class="section">
        <h2>Web Arama</h2>
        <div class="endpoint">
          <div><span class="method get">GET</span><code>/search</code></div>
          <p style="margin: 12px 0 8px 0; color: rgba(232,238,252,0.7);">Standart web araması sonuçlarını döner.</p>
          <h3>Parametreler</h3>
          <table>
            <tr><th>Parametre</th><th>Tip</th><th>Varsayılan</th><th>Açıklama</th></tr>
            <tr><td>q</td><td>string</td><td>Zorunlu</td><td>Arama sorgusu</td></tr>
            <tr><td>engines</td><td>string</td><td>Tüm motorlar</td><td>Virgülle ayrılmış motor listesi</td></tr>
            <tr><td>limitTotal</td><td>number</td><td>20</td><td>Toplam sonuç sayısı (maks: 200)</td></tr>
            <tr><td>limitPerEngine</td><td>number</td><td>5</td><td>Her motor için sonuç sayısı (maks: 20)</td></tr>
            <tr><td>pageno</td><td>number</td><td>1</td><td>Sayfa numarası</td></tr>
            <tr><td>offset</td><td>number</td><td>-</td><td>Sonuç başlangıç ofseti</td></tr>
            <tr><td>region</td><td>string</td><td>-</td><td>Bölge kodu (örn: tr, us)</td></tr>
            <tr><td>includeDomains</td><td>string</td><td>-</td><td>Sadece belirli domain'leri dahil et</td></tr>
            <tr><td>excludeDomains</td><td>string</td><td>-</td><td>Belirli domain'leri hariç tut</td></tr>
            <tr><td>cache</td><td>string</td><td>"1"</td><td>Önbellek kullanımı ("1" veya "0")</td></tr>
            <tr><td>timeoutMs</td><td>number</td><td>12000</td><td>İstek zaman aşımı süresi (ms)</td></tr>
          </table>
          <h3>Örnek İstek</h3>
          <pre>GET /search?q=typescript&engines=duckduckgo,brave&limitTotal=10&region=tr</pre>
          <h3>Yanıt Formatı</h3>
          <pre>{
  "query": "typescript",
  "engines": ["duckduckgo", "brave"],
  "limitTotal": 10,
  "limitPerEngine": 5,
  "pageno": 1,
  "count": 8,
  "results": [
    {
      "engine": "duckduckgo",
      "title": "TypeScript: JavaScript That Scales",
      "url": "https://www.typescriptlang.org/",
      "snippet": "TypeScript is a strongly typed programming language..."
    }
  ],
  "errors": [
    {
      "engine": "brave",
      "message": "timeout_error"
    }
  ]
}</pre>
        </div>
      </div>

      <div class="section">
        <h2>Görsel Arama</h2>
        <div class="endpoint">
          <div><span class="method get">GET</span><code>/search/images</code></div>
          <h3>Parametreler</h3>
          <table>
            <tr><th>Parametre</th><th>Tip</th><th>Varsayılan</th><th>Açıklama</th></tr>
            <tr><td>q</td><td>string</td><td>Zorunlu</td><td>Arama sorgusu</td></tr>
            <tr><td>limitTotal</td><td>number</td><td>50</td><td>Toplam sonuç sayısı (maks: 200)</td></tr>
            <tr><td>pageno</td><td>number</td><td>1</td><td>Sayfa numarası</td></tr>
            <tr><td>cache</td><td>string</td><td>"1"</td><td>Önbellek kullanımı</td></tr>
          </table>
          <h3>Örnek İstek</h3>
          <pre>GET /search/images?q=nature&limitTotal=20</pre>
        </div>
      </div>

      <div class="section">
        <h2>Video Arama</h2>
        <div class="endpoint">
          <div><span class="method get">GET</span><code>/search/videos</code></div>
          <h3>Parametreler</h3>
          <table>
            <tr><th>Parametre</th><th>Tip</th><th>Varsayılan</th><th>Açıklama</th></tr>
            <tr><td>q</td><td>string</td><td>Zorunlu</td><td>Arama sorgusu</td></tr>
            <tr><td>limitTotal</td><td>number</td><td>30</td><td>Toplam sonuç sayısı (maks: 100)</td></tr>
            <tr><td>pageno</td><td>number</td><td>1</td><td>Sayfa numarası</td></tr>
            <tr><td>cache</td><td>string</td><td>"1"</td><td>Önbellek kullanımı</td></tr>
          </table>
          <h3>Örnek İstek</h3>
          <pre>GET /search/videos?q=typescript+tutorial</pre>
        </div>
      </div>

      <div class="section">
        <h2>Haber Arama</h2>
        <div class="endpoint">
          <div><span class="method get">GET</span><code>/search/news</code></div>
          <h3>Parametreler</h3>
          <table>
            <tr><th>Parametre</th><th>Tip</th><th>Varsayılan</th><th>Açıklama</th></tr>
            <tr><td>q</td><td>string</td><td>Zorunlu</td><td>Arama sorgusu</td></tr>
            <tr><td>limitTotal</td><td>number</td><td>30</td><td>Toplam sonuç sayısı (maks: 100)</td></tr>
            <tr><td>pageno</td><td>number</td><td>1</td><td>Sayfa numarası</td></tr>
            <tr><td>cache</td><td>string</td><td>"1"</td><td>Önbellek kullanımı</td></tr>
          </table>
          <h3>Örnek İstek</h3>
          <pre>GET /search/news?q=artificial+intelligence</pre>
        </div>
      </div>

      <div class="section">
        <h2>Durum ve Sağlık</h2>
        <div class="endpoint">
          <div><span class="method get">GET</span><code>/status</code></div>
          <p>HTML formatında detaylı servis durumu sayfası döner.</p>
        </div>
        <div class="endpoint">
          <div><span class="method get">GET</span><code>/health</code></div>
          <p>JSON formatında servis sağlığı bilgisi döner.</p>
          <h3>Yanıt Formatı</h3>
          <pre>{
  "ok": true,
  "service": "proxy",
  "now": "2026-02-27T10:33:11.291Z",
  "runtime": {
    "node": "v20.19.2",
    "pid": 25350,
    "platform": "linux",
    "arch": "x64",
    "uptimeSec": 171
  },
  "engines": {
    "supported": ["duckduckgo", "google", "brave", "startpage", "qwant", "mojeek", "ask", "marginalia"],
    "health": {
      "google": {
        "totalRequests": 10,
        "totalErrors": 2,
        "totalResults": 45,
        "avgResponseTime": 850.5,
        "lastSuccess": "2026-02-27T10:30:00.000Z",
        "lastError": "2026-02-27T10:32:00.000Z",
        "lastErrorMessage": "blocked_or_captcha"
      }
    }
  },
  "memory": {
    "rss": 109563904,
    "heapTotal": 27860992,
    "heapUsed": 20077608,
    "external": 5106692
  }
}</pre>
        </div>
      </div>

      <div class="section">
        <h2>Desteklenen Arama Motorları</h2>
        <p>Aşağıdaki arama motorları desteklenir:</p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">
          <span class="badge">DuckDuckGo</span>
          <span class="badge">Brave</span>
          <span class="badge">Startpage</span>
          <span class="badge">Qwant</span>
          <span class="badge">Mojeek</span>
          <span class="badge">Ask</span>
          <span class="badge">Marginalia</span>
        </div>
      </div>

      <div class="section">
        <h2>Hata Kodları</h2>
        <table>
          <tr><th>Hata Kodu</th><th>Açıklama</th></tr>
          <tr><td>blocked_or_captcha</td><td>Motor tarafından engellendi veya captcha</td></tr>
          <tr><td>timeout_error</td><td>İstek zaman aşımına uğradı</td></tr>
          <tr><td>no_results_or_selector_mismatch</td><td>Sonuç bulunamadı veya HTML yapısı değişti</td></tr>
          <tr><td>network_error</td><td>Ağ bağlantı hatası</td></tr>
          <tr><td>invalid_response</td><td>Geçersiz yanıt formatı</td></tr>
        </table>
      </div>
    </main>
  </body>
</html>`);
});


import type { Engine } from './engine.js';
import type { SearchResult } from '../types.js';
import { fetchHtml } from '../http/fetchHtml.js';
import { loadHtml } from '../html/load.js';
import type { AnyNode } from 'domhandler';

function extractDuckDuckGoUrl(href: string, baseUrl: string): string {
  try {
    if (!href) return '';
    const abs = new URL(href, baseUrl);
    const uddg = abs.searchParams.get('uddg');
    if (uddg) {
      try {
        return decodeURIComponent(uddg);
      } catch {
        return uddg;
      }
    }
    return abs.toString();
  } catch {
    return '';
  }
}

async function assertNotBlockedOrEmpty(params: { url: string; html: string; count: number; status: number }): Promise<void> {
  if (params.count > 0) return;
  const hay = `${params.url}\n${params.html}`.toLowerCase();
  const blockedHints = [
    'captcha',
    'unusual traffic',
    'verify',
    'robot',
    'consent',
    'blocked',
    'access denied',
    'enable javascript',
    'attention required',
    'cloudflare',
    'temporarily unavailable',
    'service unavailable'
  ];
  const isBlocked = blockedHints.some((h) => hay.includes(h));
  const snippet = params.html.replace(/\s+/g, ' ').slice(0, 220);
  if (isBlocked || params.status === 403 || params.status === 429)
    throw new Error(
      `blocked_or_captcha status=${params.status} url=${JSON.stringify(params.url)} html_snippet=${JSON.stringify(snippet)}`
    );
  throw new Error(
    `no_results_or_selector_mismatch status=${params.status} url=${JSON.stringify(params.url)} html_snippet=${JSON.stringify(snippet)}`
  );
}

export const duckduckgo: Engine = {
  id: 'duckduckgo',
  async search({ query, limit, pageno, signal }) {
    async function parseLite(html: string, baseUrl: string): Promise<SearchResult[]> {
      const $ = loadHtml(html);
      const out: SearchResult[] = [];

      const primary = $('a.result-link')
        .toArray()
        .map((el: AnyNode) => {
          const a = $(el);
          const title = (a.text() || '').trim();
          const href = (a.attr('href') || '').trim();
          const row = a.closest('tr');
          const snippet = (row.find('td.result-snippet').text() || '').trim();
          return { title, url: href, snippet };
        });

      const items = primary.length
        ? primary
        : $('table a[href]')
          .toArray()
          .map((el: AnyNode) => {
            const a = $(el);
            const title = (a.text() || '').trim();
            const href = (a.attr('href') || '').trim();
            const row = a.closest('tr');
            const snippet = (row.find('td.result-snippet').text() || '').trim();
            return { title, url: href, snippet };
          })
          .filter((x: { title: string; url: string; snippet: string }) => x.title.length > 0 && x.url.length > 0);

      for (const it of items) {
        if (!it.title || !it.url) continue;
        const u = extractDuckDuckGoUrl(it.url, baseUrl);
        if (!u) continue;
        out.push({ engine: 'duckduckgo', title: it.title, url: u, snippet: it.snippet || undefined });
        if (out.length >= limit) break;
      }
      return out;
    }

    async function parseHtml(html: string, baseUrl: string): Promise<SearchResult[]> {
      const $ = loadHtml(html);
      const out: SearchResult[] = [];

      // html.duckduckgo.com uses a.result__a within .results
      const nodes = $('a.result__a, .result__a')
        .toArray()
        .map((el: AnyNode) => {
          const a = $(el);
          const title = (a.text() || '').trim();
          const href = (a.attr('href') || '').trim();
          const container = a.closest('.result, .results_links, .result__body');
          const snippet = (container.find('.result__snippet, .result__snippet').first().text() || '').trim();
          return { title, url: href, snippet };
        });

      for (const it of nodes) {
        if (!it.title || !it.url) continue;
        const u = extractDuckDuckGoUrl(it.url, baseUrl);
        if (!u) continue;
        out.push({ engine: 'duckduckgo', title: it.title, url: u, snippet: it.snippet || undefined });
        if (out.length >= limit) break;
      }
      return out;
    }

    // 1) Try lite
    const s = pageno && pageno > 1 ? (pageno - 1) * 30 : 0;
    const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}${s ? `&s=${s}` : ''}`;
    const lite = await fetchHtml(liteUrl, { signal, timeoutMs: 12000 });
    let results = await parseLite(lite.html, lite.url);
    try {
      await assertNotBlockedOrEmpty({ url: lite.url, html: lite.html, count: results.length, status: lite.status });
      return results;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!msg.startsWith('blocked_or_captcha')) throw e;
    }

    // 2) Fallback to html endpoint
    const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${s ? `&s=${s}` : ''}`;
    const htmlRes = await fetchHtml(htmlUrl, { signal, timeoutMs: 12000 });
    results = await parseHtml(htmlRes.html, htmlRes.url);
    await assertNotBlockedOrEmpty({ url: htmlRes.url, html: htmlRes.html, count: results.length, status: htmlRes.status });
    return results;
  }
};

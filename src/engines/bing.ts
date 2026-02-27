import type { Engine } from './engine.js';
import type { SearchResult } from '../types.js';
import { fetchHtml } from '../http/fetchHtml.js';
import { loadHtml } from '../html/load.js';
import type { AnyNode } from 'domhandler';

async function assertNotBlockedOrEmpty(params: { url: string; html: string; count: number; status: number }): Promise<void> {
  if (params.count > 0) return;
  const hay = `${params.url}\n${params.html}`.toLowerCase();
  const blockedHints = [
    'captcha',
    'unusual traffic',
    'verify',
    'robot',
    'access denied',
    'blocked',
    'enable javascript',
    'attention required',
    'are you a robot'
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

export const bing: Engine = {
  id: 'bing',
  async search({ query, limit, pageno, signal, region }) {
    const r = (region || '').toUpperCase();
    const cc = r && r !== 'ALL' ? r : '';
    const setlang = cc === 'TR' ? 'tr-tr' : cc === 'US' ? 'en-us' : '';
    const qs = new URLSearchParams();
    qs.set('q', query);
    if (cc) qs.set('cc', cc);
    if (setlang) qs.set('setlang', setlang);
    if (pageno && pageno > 1) {
      qs.set('first', String((pageno - 1) * 10 + 1));
    }
    const reqUrl = `https://www.bing.com/search?${qs.toString()}`;
    const { html, url, status } = await fetchHtml(reqUrl, {
      signal,
      timeoutMs: 20000,
      headers: {
        'accept-language': cc === 'TR' ? 'tr-TR,tr;q=0.9,en;q=0.6' : 'en-US,en;q=0.9'
      }
    });
    const $ = loadHtml(html);

    const results: SearchResult[] = [];
    const nodes = $('li.b_algo').toArray();
    for (const el of nodes) {
      const n = $(el as AnyNode);
      const a = n.find('h2 a[href]').first();
      const title = (a.text() || '').trim();
      const href = (a.attr('href') || '').trim();
      const snippet = (n.find('.b_caption p').first().text() || '').trim();
      if (!title || !href) continue;
      results.push({ engine: 'bing', title, url: href, snippet: snippet || undefined });
      if (results.length >= limit) break;
    }

    await assertNotBlockedOrEmpty({ url, html, count: results.length, status });
    return results;
  }
};

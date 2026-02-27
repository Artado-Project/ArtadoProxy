import type { Engine } from './engine.js';
import type { SearchResult } from '../types.js';
import { fetchHtml } from '../http/fetchHtml.js';
import { loadHtml } from '../html/load.js';
import type { AnyNode } from 'domhandler';

export const qwant: Engine = {
  id: 'qwant',
  async search({ query, limit, signal }) {
    const reqUrl = `https://www.qwant.com/?q=${encodeURIComponent(query)}&t=web`;
    const { html, url: finalUrl } = await fetchHtml(reqUrl, { signal, timeoutMs: 20000 });
    const $ = loadHtml(html);

    const results: SearchResult[] = [];
    const nodes = $('a[data-testid="webResult-link"], a[href][data-testid*="result"]').toArray();
    for (const el of nodes) {
      const a = $(el as AnyNode);
      const hrefRaw = (a.attr('href') || '').trim();
      const href = hrefRaw ? new URL(hrefRaw, finalUrl).toString() : '';
      const container = a.closest('article, li, div');
      const titleEl = container.find('h2, h3').first();
      const title = ((titleEl.text() || a.text()) || '').trim();
      const snippet = (container.find('p').first().text() || '').trim();
      if (!title || !href) continue;
      results.push({ engine: 'qwant', title, url: href, snippet: snippet || undefined });
      if (results.length >= limit) break;
    }
    return results;
  }
};

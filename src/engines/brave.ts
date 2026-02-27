import type { Engine } from './engine.js';
import type { SearchResult } from '../types.js';
import { fetchHtml } from '../http/fetchHtml.js';
import { loadHtml } from '../html/load.js';
import type { AnyNode } from 'domhandler';

export const brave: Engine = {
  id: 'brave',
  async search({ query, limit, signal }) {
    const reqUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
    const { html } = await fetchHtml(reqUrl, { signal, timeoutMs: 20000 });
    const $ = loadHtml(html);

    const results: SearchResult[] = [];
    $('div#results .snippet, div.snippet')
      .toArray()
      .some((el: AnyNode) => {
        const n = $(el);
        const a = n.find('a[href]').first();
        const titleEl = n.find('a[href] .title, .title').first();
        const title = ((titleEl.text() || a.text()) || '').trim();
        const url = (a.attr('href') || '').trim();
        const snippet = (n.find('.snippet-description, .description').first().text() || '').trim();
        if (!title || !url) return false;
        results.push({ engine: 'brave', title, url, snippet: snippet || undefined });
        return results.length >= limit;
      });

    return results;
  }
};

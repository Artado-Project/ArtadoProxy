import type { Engine } from './engine.js';
import type { SearchResult } from '../types.js';
import { fetchHtml } from '../http/fetchHtml.js';
import { loadHtml } from '../html/load.js';
import type { AnyNode } from 'domhandler';

export const mojeek: Engine = {
  id: 'mojeek',
  async search({ query, limit, signal }) {
    const reqUrl = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    const { html } = await fetchHtml(reqUrl, { signal, timeoutMs: 20000 });
    const $ = loadHtml(html);

    const results: SearchResult[] = [];
    $('li.result, .results li')
      .toArray()
      .some((el: AnyNode) => {
        const n = $(el);
        const a = n.find('a[href]').first();
        const title = (a.text() || '').trim();
        const url = (a.attr('href') || '').trim();
        const snippet = (n.find('p').first().text() || '').trim();
        if (!title || !url) return false;
        results.push({ engine: 'mojeek', title, url, snippet: snippet || undefined });
        return results.length >= limit;
      });

    return results;
  }
};

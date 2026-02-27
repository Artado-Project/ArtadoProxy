import type { Engine } from './engine.js';
import type { SearchResult } from '../types.js';
import { fetchHtml } from '../http/fetchHtml.js';

export const marginalia: Engine = {
    id: 'marginalia',
    async search({ query, limit, pageno, signal }) {
        // Using the public API as it is more reliable than scraping which is often blocked by Anubis (PoW)
        const p = pageno && pageno > 1 ? pageno - 1 : 0;
        const reqUrl = `https://api2.marginalia-search.com/search?query=${encodeURIComponent(query)}${p ? `&page=${p}` : ''}`;

        try {
            const { html } = await fetchHtml(reqUrl, {
                signal,
                timeoutMs: 20000,
                headers: {
                    'API-Key': 'public'
                }
            });

            const data = JSON.parse(html);
            const results: SearchResult[] = (data.results || [])
                .slice(0, limit)
                .map((r: any) => ({
                    engine: 'marginalia',
                    title: r.title || r.url,
                    url: r.url,
                    snippet: r.description || undefined
                }));

            return results;
        } catch (e) {
            // Fallback or error
            return [];
        }
    }
};

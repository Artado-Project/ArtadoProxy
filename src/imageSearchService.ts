import { LRUCache } from 'lru-cache';
import type { ImageResult } from './types.js';
import { googleImages } from './engines/google-images.js';

const imageEngines = [googleImages];

const cache = new LRUCache<string, { results: ImageResult[] }>({
    max: 500,
    ttl: 60_000
});

export async function imageSearch(params: {
    query: string;
    limitTotal?: number;
    useCache?: boolean;
    signal?: AbortSignal;
    pageno?: number;
}): Promise<{ results: ImageResult[] }> {
    const limitTotal = Math.max(1, Math.min(200, params.limitTotal ?? 50));
    const pageno = Math.max(1, params.pageno ?? 1);
    const key = `images://${params.query}::${limitTotal}::${pageno}`;
    const useCache = params.useCache ?? true;

    if (useCache) {
        const cached = cache.get(key);
        if (cached) return cached;
    }

    const results: ImageResult[] = [];

    for (const engine of imageEngines) {
        if (params.signal?.aborted) break;

        try {
            const engineResults = await engine.search({
                query: params.query,
                limit: limitTotal,
                signal: params.signal,
                pageno
            });
            results.push(...engineResults);
        } catch (e) {
            // Skip failed engines
            console.error(`Image engine ${engine.id} failed:`, e instanceof Error ? e.message : 'unknown error');
        }

        if (results.length >= limitTotal) break;
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
        const normalized = r.url.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });

    const final = deduped.slice(0, limitTotal);
    const payload = { results: final };

    if (useCache) cache.set(key, payload);
    return payload;
}

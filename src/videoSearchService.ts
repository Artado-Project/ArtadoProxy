import { LRUCache } from 'lru-cache';
import type { VideoResult } from './types.js';
import { googleVideos } from './engines/google-videos.js';

const videoEngines = [googleVideos];

const cache = new LRUCache<string, { results: VideoResult[] }>({
    max: 500,
    ttl: 60_000
});

export async function videoSearch(params: {
    query: string;
    limitTotal?: number;
    useCache?: boolean;
    signal?: AbortSignal;
    pageno?: number;
}): Promise<{ results: VideoResult[] }> {
    const limitTotal = Math.max(1, Math.min(100, params.limitTotal ?? 30));
    const pageno = Math.max(1, params.pageno ?? 1);
    const key = `videos://${params.query}::${limitTotal}::${pageno}`;
    const useCache = params.useCache ?? true;

    if (useCache) {
        const cached = cache.get(key);
        if (cached) return cached;
    }

    const results: VideoResult[] = [];

    for (const engine of videoEngines) {
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
            console.error(`Video engine ${engine.id} failed:`, e instanceof Error ? e.message : 'unknown error');
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

import { LRUCache } from 'lru-cache';
import pLimit from 'p-limit';
import type { Engine, EngineSearchParams } from './engines/engine.js';
import type { EngineError, SearchEngineId, SearchResult } from './types.js';
import { engines } from './engines/index.js';

const engineMap = new Map<SearchEngineId, Engine>(engines.map((e) => [e.id, e]));
const defaultEngines: SearchEngineId[] = engines.map((e) => e.id);

function parseDomainList(raw?: string): Set<string> {
  if (!raw) return new Set();
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((d) => d.replace(/^\*\./, ''));
  return new Set(parts);
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isSearchEngineHost(host: string): boolean {
  return (
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host === 'bing.com' ||
    host.endsWith('.bing.com') ||
    host === 'yandex.com' ||
    host.endsWith('.yandex.com') ||
    host === 'yandex.ru' ||
    host.endsWith('.yandex.ru') ||
    host === 'duckduckgo.com' ||
    host.endsWith('.duckduckgo.com') ||
    host === 'search.brave.com' ||
    host.endsWith('.search.brave.com') ||
    host === 'startpage.com' ||
    host.endsWith('.startpage.com')
  );
}

function cleanResultUrl(rawUrl: string): string {
  try {
    if (!rawUrl) return '';
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) return '';
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');

    // Google redirect: /url?q=<target>
    if ((host === 'google.com' || host.endsWith('.google.com')) && u.pathname === '/url') {
      const q = u.searchParams.get('q') || u.searchParams.get('url') || '';
      if (q.startsWith('http://') || q.startsWith('https://')) return q;
      return '';
    }

    // Yandex redirect: /clck/jsredir?...&url=<target> or /clck/... with url param
    if ((host === 'yandex.ru' || host.endsWith('.yandex.ru') || host === 'yandex.com' || host.endsWith('.yandex.com')) && u.pathname.includes('clck')) {
      const target = u.searchParams.get('url') || u.searchParams.get('u') || '';
      if (target.startsWith('http://') || target.startsWith('https://')) return target;
      return '';
    }

    // Startpage redirect: /sp/click?url=<target>
    if ((host === 'startpage.com' || host.endsWith('.startpage.com')) && u.pathname.includes('/sp/click')) {
      const target = u.searchParams.get('url') || '';
      if (target.startsWith('http://') || target.startsWith('https://')) return target;
      return '';
    }

    // Yahoo/AOL redirect style: ...?RU=<encoded target>
    if (
      host === 'r.search.yahoo.com' ||
      host.endsWith('.search.yahoo.com') ||
      host === 'r.search.aol.com' ||
      host.endsWith('.search.aol.com')
    ) {
      const ru = u.searchParams.get('RU') || u.searchParams.get('ru') || '';
      if (ru) {
        try {
          const decoded = decodeURIComponent(ru);
          if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
        } catch {
          if (ru.startsWith('http://') || ru.startsWith('https://')) return ru;
        }
      }

      // Some variants put RU in the path: .../RU=<encoded>/RK=.../RS=...
      const m = u.pathname.match(/\/RU=([^/]+)/i);
      if (m && m[1]) {
        const ruPath = m[1];
        try {
          const decoded = decodeURIComponent(ruPath);
          if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
        } catch {
          if (ruPath.startsWith('http://') || ruPath.startsWith('https://')) return ruPath;
        }
      }
    }

    // AOL click redirect: /click;_ylt=...?...&u=<target>
    if ((host === 'search.aol.com' || host.endsWith('.search.aol.com')) && u.pathname.toLowerCase().includes('click')) {
      const target = u.searchParams.get('u') || u.searchParams.get('url') || '';
      if (target) {
        try {
          const decoded = decodeURIComponent(target);
          if (decoded.startsWith('http://') || decoded.startsWith('https://')) return decoded;
        } catch {
          if (target.startsWith('http://') || target.startsWith('https://')) return target;
        }
      }
    }

    return u.toString();
  } catch {
    return '';
  }
}

function normalizeUrlForDedupe(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function matchesDomain(set: Set<string>, host: string): boolean {
  if (set.size === 0) return false;
  if (set.has(host)) return true;
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (set.has(parent)) return true;
  }
  return false;
}

const engineWeight: Record<SearchEngineId, number> = {
  duckduckgo: 1.0,
  google: 1.0,
  bing: 0.97,
  yandex: 0.9,
  brave: 0.95,
  startpage: 0.9,
  qwant: 0.85,
  ecosia: 0.8,
  mojeek: 0.75,
  yahoo: 0.7,
  ask: 0.6,
  marginalia: 0.4
};

const cache = new LRUCache<string, { results: SearchResult[]; errors: EngineError[] }>({
  max: 500,
  ttl: 300_000
});

const perEngineConcurrency = Math.max(1, Math.min(3, Number(process.env.PER_ENGINE_CONCURRENCY ?? 2)));
const globalConcurrency = Math.max(1, Math.min(8, Number(process.env.GLOBAL_ENGINE_CONCURRENCY ?? 4)));
const globalLimit = pLimit(globalConcurrency);
const perEngineLimit = new Map<SearchEngineId, ReturnType<typeof pLimit>>(
  engines.map((e) => [e.id, pLimit(perEngineConcurrency)])
);

const blockedUntil = new Map<SearchEngineId, number>();
const blockedCooldownMs = Math.max(30_000, Math.min(30 * 60_000, Number(process.env.BLOCKED_ENGINE_COOLDOWN_MS ?? 10 * 60_000)));

export type EngineHealth = {
  totalRequests: number;
  totalErrors: number;
  lastSuccess?: string;
  lastError?: string;
  lastErrorMessage?: string;
  avgResponseTime?: number;
  totalResults?: number;
};

// Global search statistics
let globalSearchStats = {
  totalSearches: 0,
  totalResults: 0,
  totalErrors: 0,
  avgResponseTime: 0,
  searchesToday: 0,
  searchesThisHour: 0,
  lastSearchTime: '',
  searchQueries: [] as string[],
  popularQueries: {} as Record<string, number>
};

const engineHealth = new Map<SearchEngineId, EngineHealth>();

export function getEngineHealth(): Record<string, EngineHealth> {
  const health = Object.fromEntries(engineHealth.entries());
  
  // If no engines have been used yet, return empty health data for all available engines
  if (Object.keys(health).length === 0) {
    const emptyHealth: Record<string, EngineHealth> = {};
    engines.forEach(engine => {
      emptyHealth[engine.id] = {
        totalRequests: 0,
        totalErrors: 0,
        totalResults: 0,
        avgResponseTime: 0
      };
    });
    return emptyHealth;
  }
  
  return health;
}

export function getGlobalSearchStats() {
  return { ...globalSearchStats };
}

function updateGlobalSearchStats(query: string, resultCount: number, responseTime: number, hasError: boolean) {
  globalSearchStats.totalSearches++;
  globalSearchStats.totalResults += resultCount;
  if (hasError) globalSearchStats.totalErrors++;
  
  // Update average response time
  globalSearchStats.avgResponseTime = 
    (globalSearchStats.avgResponseTime * (globalSearchStats.totalSearches - 1) + responseTime) / globalSearchStats.totalSearches;
  
  // Update time-based counters
  const now = new Date();
  const today = now.toDateString();
  const thisHour = now.getHours();
  
  globalSearchStats.lastSearchTime = now.toISOString();
  globalSearchStats.searchQueries.push(query);
  
  // Keep only last 100 queries
  if (globalSearchStats.searchQueries.length > 100) {
    globalSearchStats.searchQueries = globalSearchStats.searchQueries.slice(-100);
  }
  
  // Update popular queries
  const queryLower = query.toLowerCase();
  globalSearchStats.popularQueries[queryLower] = (globalSearchStats.popularQueries[queryLower] || 0) + 1;
}

export function parseEnginesParam(raw?: string): SearchEngineId[] {
  if (!raw) return defaultEngines;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as SearchEngineId[];

  const uniq = Array.from(new Set(parts));
  return uniq.filter((id) => engineMap.has(id));
}

export async function metaSearch(params: {
  query: string;
  engines: SearchEngineId[];
  limitPerEngine: number;
  limitTotal?: number;
  includeDomains?: string;
  excludeDomains?: string;
  useCache?: boolean;
  signal?: AbortSignal;
  region?: string;
  pageno?: number;
}): Promise<{ results: SearchResult[]; errors: EngineError[] }> {
  const startTime = Date.now();
  const limitTotal = Math.max(1, Math.min(200, params.limitTotal ?? 25));
  const pageno = Math.max(1, params.pageno ?? 1);
  const key = `${params.query}::${params.engines.join(',')}::${params.limitPerEngine}::${limitTotal}::${params.includeDomains ?? ''}::${params.excludeDomains ?? ''}::${params.region ?? ''}::${pageno}`;
  const useCache = params.useCache ?? true;
  if (useCache) {
    const cached = cache.get(key);
    if (cached) return cached;
  }

  const errors: EngineError[] = [];

  type Scored = SearchResult & { _score: number; _pos: number };

  async function runEngines(engineIds: SearchEngineId[], limitPerEngine: number): Promise<Scored[]> {
    const tasks = engineIds.map(async (engineId) => {
      const engine = engineMap.get(engineId);
      if (!engine) return [];

      // Update engine health - increment request count
      const currentHealth = engineHealth.get(engineId) || { 
        totalRequests: 0, 
        totalErrors: 0, 
        totalResults: 0,
        avgResponseTime: 0 
      };
      currentHealth.totalRequests++;
      engineHealth.set(engineId, currentHealth);

      const until = blockedUntil.get(engineId);
      if (until && until > Date.now()) {
        errors.push({ engine: engineId, message: `skipped_recent_blocked until=${new Date(until).toISOString()}` });
        
        // Update engine health - record error
        currentHealth.totalErrors++;
        currentHealth.lastError = new Date().toISOString();
        currentHealth.lastErrorMessage = `skipped_recent_blocked until=${new Date(until).toISOString()}`;
        engineHealth.set(engineId, currentHealth);
        
        return [];
      }

      const limiter = perEngineLimit.get(engineId) ?? pLimit(1);
      return globalLimit(() => limiter(async () => {
        const p: EngineSearchParams = {
          query: params.query,
          limit: limitPerEngine,
          signal: params.signal,
          region: params.region,
          pageno
        };

        try {
          const engineStartTime = Date.now();
          const out = await engine.search(p);
          const engineResponseTime = Date.now() - engineStartTime;
          
          // Update engine health - record success
          currentHealth.lastSuccess = new Date().toISOString();
          currentHealth.totalResults = (currentHealth.totalResults || 0) + out.length;
          
          // Update average response time
          if (!currentHealth.avgResponseTime) {
            currentHealth.avgResponseTime = engineResponseTime;
          } else {
            currentHealth.avgResponseTime = 
              (currentHealth.avgResponseTime * (currentHealth.totalRequests - 1) + engineResponseTime) / currentHealth.totalRequests;
          }
          
          engineHealth.set(engineId, currentHealth);
          
          return out.map((r, idx) => ({ ...r, _pos: idx, _score: (engineWeight[engineId] ?? 0.5) / (1 + idx) }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'engine error';
          if (msg.startsWith('blocked_or_captcha')) {
            blockedUntil.set(engineId, Date.now() + blockedCooldownMs);
          }
          
          // Update engine health - record error
          currentHealth.totalErrors++;
          currentHealth.lastError = new Date().toISOString();
          currentHealth.lastErrorMessage = msg;
          engineHealth.set(engineId, currentHealth);
          
          errors.push({ engine: engineId, message: msg });
          return [];
        }
      }));
    });

    const chunks = await Promise.all(tasks);
    return chunks.flat() as Scored[];
  }

  const requested = params.engines;
  const preferred: SearchEngineId[] = ['google', 'bing', 'yandex', 'brave'];
  const wanted = preferred.filter((e) => requested.includes(e));
  const wantedOrDefault = wanted.length ? wanted : preferred.filter((e) => engineMap.has(e));

  const totalTarget = limitTotal;
  const quotas: Array<{ engine: SearchEngineId; limit: number }> = [];

  const wantSet = new Set(wantedOrDefault);
  const wantGoogle = wantSet.has('google');
  const wantBing = wantSet.has('bing');
  const wantYandex = wantSet.has('yandex');
  const wantBrave = wantSet.has('brave');

  // Scale quotas with requested total.
  // Baseline total=25 => google 10, bing 7, yandex/brave share remaining.
  const scale = Math.max(0.2, totalTarget / 25);
  if (wantGoogle) quotas.push({ engine: 'google', limit: Math.max(5, Math.round(10 * scale)) });
  if (wantBing) quotas.push({ engine: 'bing', limit: Math.max(4, Math.round(7 * scale)) });

  const remainingEngines: SearchEngineId[] = [];
  if (wantYandex) remainingEngines.push('yandex');
  if (wantBrave) remainingEngines.push('brave');

  // Remaining budget; distribute across yandex/brave with soft bounds.
  let remaining = totalTarget - quotas.reduce((s, q) => s + q.limit, 0);
  if (remaining < 0) remaining = 0;
  const per = remainingEngines.length ? Math.ceil(remaining / remainingEngines.length) : 0;
  for (const e of remainingEngines) {
    quotas.push({ engine: e, limit: Math.max(3, per) });
  }

  // If client asked only one engine, don't force 20.
  if (requested.length === 1 && requested[0] && engineMap.has(requested[0])) {
    quotas.splice(0, quotas.length, { engine: requested[0], limit: Math.max(1, Math.min(50, totalTarget)) });
  }

  const include = parseDomainList(params.includeDomains);
  const exclude = parseDomainList(params.excludeDomains);

  const deduped = new Map<string, { best: Scored; sources: Set<SearchEngineId> }>();

  for (const q of quotas) {
    if (params.signal?.aborted) break;
    const scored = await runEngines([q.engine], Math.max(1, Math.min(30, q.limit)));

    for (const r0 of scored) {
      const cleanedUrl = cleanResultUrl(r0.url);
      if (!cleanedUrl) continue;

      const host = getHostname(cleanedUrl);
      if (!host) continue;
      if (isSearchEngineHost(host)) continue;
      if (matchesDomain(exclude, host)) continue;
      if (include.size > 0 && !matchesDomain(include, host)) continue;

      const r: Scored = { ...r0, url: cleanedUrl };

      const k = normalizeUrlForDedupe(r.url);
      const prev = deduped.get(k);
      if (!prev) {
        deduped.set(k, { best: r, sources: new Set([q.engine]) });
        continue;
      }

      prev.sources.add(q.engine);
      if (r._score > prev.best._score) prev.best = r;
    }

    if (deduped.size >= totalTarget) break;
  }

  // Fill with additional engines if needed (helps pagination when some engines are blocked or return few results).
  if (deduped.size < totalTarget && !params.signal?.aborted) {
    const used = new Set(quotas.map((q) => q.engine));
    const extras = requested.filter((e) => engineMap.has(e) && !used.has(e));
    const fallback = Array.from(engineMap.keys()).filter((e) => !used.has(e) && !extras.includes(e));
    const fillOrder = [...extras, ...fallback];

    for (const e of fillOrder) {
      if (params.signal?.aborted) break;
      if (deduped.size >= totalTarget) break;

      const scored = await runEngines([e], 10);
      for (const r0 of scored) {
        const cleanedUrl = cleanResultUrl(r0.url);
        if (!cleanedUrl) continue;

        const host = getHostname(cleanedUrl);
        if (!host) continue;
        if (isSearchEngineHost(host)) continue;
        if (matchesDomain(exclude, host)) continue;
        if (include.size > 0 && !matchesDomain(include, host)) continue;

        const r: Scored = { ...r0, url: cleanedUrl };
        const k = normalizeUrlForDedupe(r.url);
        const prev = deduped.get(k);
        if (!prev) {
          deduped.set(k, { best: r, sources: new Set([e]) });
          continue;
        }
        prev.sources.add(e);
        if (r._score > prev.best._score) prev.best = r;
      }
    }
  }

  const results = Array.from(deduped.values())
    .map(({ best, sources }) => {
      return {
        best,
        sources
      };
    })
    .sort((a, b) => b.best._score - a.best._score)
    .slice(0, totalTarget)
    .map(({ best, sources }) => {
      const { _score: _s, _pos: _p, ...rest } = best;
      return {
        ...rest,
        sources: Array.from(sources)
      };
    });

  const payload = { results, errors };
  if (useCache) cache.set(key, payload);

  // Update global search statistics
  const totalResponseTime = Date.now() - startTime;
  updateGlobalSearchStats(params.query, results.length, totalResponseTime, errors.length > 0);

  return payload;
}

import express, { Request, Response, NextFunction } from 'express';
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import { load } from "cheerio";
import { Results, ImageResult, NewsResult, VideoResult } from "./results";
import * as iconv from 'iconv-lite';
import * as http from 'http';
import * as https from 'https';

const rateLimit = require('express-rate-limit');

const keepAliveHttp = new http.Agent({ keepAlive: true, maxSockets: 50 });
const keepAliveHttps = new https.Agent({ keepAlive: true, maxSockets: 50 });

const httpClient = axios.create({
    httpAgent: keepAliveHttp,
    httpsAgent: keepAliveHttps,
    timeout: 12000,
    maxRedirects: 5
});

const CACHE_TTL_MS = 5 * 60 * 1000;
interface CacheEntry { value: any; expiresAt: number; }
const cache = new Map<string, CacheEntry>();

function cacheGet<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value as T;
}

function cacheSet(key: string, value: any, ttl: number = CACHE_TTL_MS): void {
    cache.set(key, { value, expiresAt: Date.now() + ttl });
    if (cache.size > 500) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
    }
}

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

const app = express();

let requestCount = 0;
const REQUEST_THRESHOLD = 100;
const RESET_INTERVAL = 5 * 60 * 60 * 1000;

const requestCounter = (req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/api')) {
        requestCount++;
        console.log(`Request count: ${requestCount}`);
    }
    next();
};

app.use(requestCounter);
app.use(cors());
app.use(bodyParser.json());

const REQUEST_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8"
};

const BING_TR_PARAMS = { setlang: "tr", cc: "TR", mkt: "tr-TR" };

function parseGoogleResultUrl(href: string): string {
    if (!href) return "";
    if (href.startsWith("/url?q=")) {
        const raw = href.slice("/url?q=".length).split("&")[0];
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    if (href.startsWith("http://") || href.startsWith("https://")) {
        return href;
    }
    return "";
}

function normalizeDisplayUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    } catch {
        return url;
    }
}

function decodeBingRedirectUrl(url: string): string {
    if (!url) return url;
    if (url.includes("bing.com/news/apiclick.aspx") || url.includes("bing.com/ck/a")) {
        const urlMatch = url.match(/[?&]url=([^&]+)/);
        if (urlMatch?.[1]) {
            try { return decodeURIComponent(urlMatch[1]); } catch { }
        }
    }
    if (!url.includes("bing.com/ck/a")) return url;
    const match = url.match(/[?&]u=([^&]+)/);
    if (!match?.[1]) return url;

    let candidate = match[1];
    try {
        candidate = decodeURIComponent(candidate);
    } catch {
    }

    if (/^a\d/.test(candidate)) {
        candidate = candidate.slice(2);
    }

    try {
        const normalized = candidate.replace(/-/g, "+").replace(/_/g, "/");
        const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
        const decoded = Buffer.from(normalized + padding, "base64").toString("utf8");
        if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
            return decoded;
        }
    } catch {
    }

    return candidate;
}

async function getGoogle(q: string, n: number): Promise<Results[]> {
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));
    const cacheKey = `google:${q}:${limit}`;
    const cached = cacheGet<Results[]>(cacheKey);
    if (cached) return cached;

    const results: Results[] = [];
    const seenUrls = new Set<string>();

    try {
        const response = await httpClient.post(
            "https://www.startpage.com/sp/search",
            new URLSearchParams({ q, num: String(limit) }).toString(),
            {
                headers: {
                    ...REQUEST_HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Referer": "https://www.startpage.com/"
                }
            }
        );

        const html = response.data as string;
        const $ = load(html);

        const cleanText = (el: any): string =>
            $(el).clone().find("style").remove().end().text().trim();

        $("a.result-title.result-link").each((_, element) => {
            if (results.length >= limit) return false;

            const title = cleanText(element);
            const url = $(element).attr("href") || "";

            if (!title || !url || seenUrls.has(url)) return;

            const container = $(element).parent();
            const description = cleanText(container.find("p.description").first());
            seenUrls.add(url);
            results.push({
                title,
                description,
                displayUrl: normalizeDisplayUrl(url),
                url,
                source: "Google"
            });
        });

    } catch (error) {
        console.error("Error fetching from Startpage (Google):", (error as Error).message);
    }

    if (results.length) cacheSet(cacheKey, results);
    return results;
}

async function getBing(q: string, n: number): Promise<Results[]> {
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));
    const cacheKey = `bing:${q}:${limit}`;
    const cached = cacheGet<Results[]>(cacheKey);
    if (cached) return cached;

    const results: Results[] = [];

    try {
        const response = await httpClient.get("https://www.bing.com/search", {
            params: { q, count: limit, format: "rss", ...BING_TR_PARAMS },
            headers: REQUEST_HEADERS,
            responseType: "arraybuffer"
        });
        const xml = iconv.decode(Buffer.from(response.data), "utf-8");

        const $ = load(xml, { xmlMode: true });

        $("item").each((_, element) => {
            if (results.length >= limit) return false;

            const title = $(element).find("title").first().text().trim();
            const rawUrl = $(element).find("link").first().text().trim();
            const description = $(element).find("description").first().text().trim();
            const url = decodeBingRedirectUrl(rawUrl);

            if (!title || !url) return;

            results.push({
                title,
                description,
                displayUrl: normalizeDisplayUrl(url),
                url,
                source: "Bing"
            });
        });
    } catch (error) {
        console.error("Error fetching from Bing:", (error as Error).message);
    }

    if (results.length) cacheSet(cacheKey, results);
    return results;
}

function mergeResults(a: Results[], b: Results[]): Results[] {
    const map = new Map<string, Results>();
    for (const item of a) map.set(item.title, item);
    for (const item of b) if (!map.has(item.title)) map.set(item.title, item);
    return Array.from(map.values());
}


async function getImages(q: string, n: number): Promise<ImageResult[]> {
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));
    const cacheKey = `images:${q}:${limit}`;
    const cached = cacheGet<ImageResult[]>(cacheKey);
    if (cached) return cached;

    const results: ImageResult[] = [];

    try {
        const response = await httpClient.get("https://www.bing.com/images/search", {
            params: { q, count: limit, first: 1, ...BING_TR_PARAMS },
            headers: REQUEST_HEADERS,
            responseType: "arraybuffer"
        });

        const html = iconv.decode(Buffer.from(response.data), "utf-8");
        const $ = load(html);

        $("a.iusc[m]").each((_, element) => {
            if (results.length >= limit) return false;
            try {
                const m = JSON.parse($(element).attr("m") || "{}");
                const title = (m.t || "").trim();
                const url = m.murl || "";
                const thumbnailUrl = m.turl || "";
                const sourceUrl = m.purl || "";
                if (!url) return;
                results.push({ title, url, thumbnailUrl, sourceUrl, source: "Bing" });
            } catch { }
        });

    } catch (error) {
        console.error("Error fetching images from Bing:", (error as Error).message);
    }

    if (results.length) cacheSet(cacheKey, results);
    return results;
}

async function getNews(q: string, n: number): Promise<NewsResult[]> {
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));
    const cacheKey = `news:${q}:${limit}`;
    const cached = cacheGet<NewsResult[]>(cacheKey);
    if (cached) return cached;

    const results: NewsResult[] = [];

    try {
        const response = await httpClient.get("https://www.bing.com/news/search", {
            params: { q, count: limit, format: "rss", ...BING_TR_PARAMS },
            headers: REQUEST_HEADERS,
            responseType: "arraybuffer"
        });

        const xml = iconv.decode(Buffer.from(response.data), "utf-8");
        const $ = load(xml, { xmlMode: true });

        $("item").each((_, element) => {
            if (results.length >= limit) return false;

            const title = $(element).find("title").first().text().trim();
            const rawUrl = $(element).find("link").first().text().trim();
            const description = $(element).find("description").first().text().trim();
            const publishedAt = $(element).find("pubDate").first().text().trim();
            const newsSource = $(element).find("News\\:Source, source").first().text().trim();
            const thumbnailUrl = $(element).find("News\\:Image, enclosure").first().text().trim()
                || $(element).find("News\\:Image, enclosure").first().attr("url") || "";

            const url = decodeBingRedirectUrl(rawUrl);
            if (!title || !url) return;

            results.push({
                title,
                description,
                url,
                displayUrl: normalizeDisplayUrl(url),
                publishedAt,
                newsSource,
                thumbnailUrl,
                source: "Bing"
            });
        });

    } catch (error) {
        console.error("Error fetching news from Bing:", (error as Error).message);
    }

    if (results.length) cacheSet(cacheKey, results);
    return results;
}

async function getVideos(q: string, n: number): Promise<VideoResult[]> {
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));
    const cacheKey = `videos:${q}:${limit}`;
    const cached = cacheGet<VideoResult[]>(cacheKey);
    if (cached) return cached;

    const results: VideoResult[] = [];

    try {
        const response = await httpClient.get("https://www.bing.com/videos/search", {
            params: { q, count: limit, ...BING_TR_PARAMS },
            headers: REQUEST_HEADERS,
            responseType: "arraybuffer"
        });

        const html = iconv.decode(Buffer.from(response.data), "utf-8");
        const $ = load(html);

        $(".mc_vtvc").each((_, element) => {
            if (results.length >= limit) return false;

            const link = $(element).find("a.mc_vtvc_link").first();
            const aria = link.attr("aria-label") || "";
            const url = $(element).find("[ourl]").first().attr("ourl") || "";
            const thumbnailUrl = $(element).find("img").first().attr("src") || "";

            const titleMatch = aria.match(/^(.+?)\s+from\s+\w/i) || aria.match(/^([^|·]+)/);
            const title = titleMatch ? titleMatch[1].trim() : "";

            const durMatch = aria.match(/Duration:\s*([^·]+)/);
            const duration = durMatch ? durMatch[1].trim() : "";

            const pubMatch = aria.match(/uploaded by ([^·]+)/);
            const publisher = pubMatch ? pubMatch[1].trim() : "";

            if (!title || !url) return;

            results.push({ title, url, thumbnailUrl, duration, publisher, source: "Bing" });
        });

    } catch (error) {
        console.error("Error fetching videos from Bing:", (error as Error).message);
    }

    if (results.length) cacheSet(cacheKey, results);
    return results;
}

interface EngineStatus { name: string; ok: boolean; latencyMs: number; checkedAt: number; }
let engineStatusCache: { entries: EngineStatus[]; expiresAt: number } = { entries: [], expiresAt: 0 };
const STATUS_CACHE_TTL_MS = 30 * 1000;

async function checkEngine(name: string, fn: () => Promise<any[]>): Promise<EngineStatus> {
    const start = Date.now();
    try {
        const out = await fn();
        return { name, ok: out.length > 0, latencyMs: Date.now() - start, checkedAt: Date.now() };
    } catch {
        return { name, ok: false, latencyMs: Date.now() - start, checkedAt: Date.now() };
    }
}

async function getEngineStatuses(force = false): Promise<EngineStatus[]> {
    if (!force && Date.now() < engineStatusCache.expiresAt && engineStatusCache.entries.length) {
        return engineStatusCache.entries;
    }
    const entries = await Promise.all([
        checkEngine("Google (Web)", () => getGoogle("test", 3)),
        checkEngine("Bing (Web)", () => getBing("test", 3)),
        checkEngine("Bing (Images)", () => getImages("test", 3)),
        checkEngine("Bing (News)", () => getNews("test", 3)),
        checkEngine("Bing (Videos)", () => getVideos("test", 3))
    ]);
    engineStatusCache = { entries, expiresAt: Date.now() + STATUS_CACHE_TTL_MS };
    return entries;
}

app.get("/", async (req, res) => {
    try {
        const statuses = await getEngineStatuses();
        const rows = statuses.map(s => `
            <tr>
                <td>${s.name}</td>
                <td><span class="badge ${s.ok ? "ok" : "down"}">${s.ok ? "Çalışıyor" : "Hata"}</span></td>
                <td>${s.latencyMs} ms</td>
            </tr>`).join("");
        const allOk = statuses.every(s => s.ok);
        const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Artado Proxy — Motor Durumu</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 2rem; background: #0f1115; color: #e6e8eb; }
  .card { max-width: 720px; margin: 0 auto; background: #181b22; border: 1px solid #262a33; border-radius: 12px; padding: 1.5rem 2rem; box-shadow: 0 4px 24px rgba(0,0,0,.3); }
  h1 { margin: 0 0 .25rem; font-size: 1.5rem; }
  .sub { color: #98a0ad; margin-bottom: 1.5rem; font-size: .9rem; }
  .summary { padding: .6rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-weight: 600; }
  .summary.ok { background: #0f3320; color: #4ade80; border: 1px solid #1f5a37; }
  .summary.down { background: #3a1414; color: #f87171; border: 1px solid #5a1f1f; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: .65rem .5rem; border-bottom: 1px solid #262a33; }
  th { color: #98a0ad; font-weight: 500; font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; }
  .badge { padding: .15rem .55rem; border-radius: 999px; font-size: .8rem; font-weight: 600; }
  .badge.ok { background: #0f3320; color: #4ade80; }
  .badge.down { background: #3a1414; color: #f87171; }
  .endpoints { margin-top: 1.5rem; font-size: .9rem; }
  .endpoints code { background: #0f1115; padding: .15rem .4rem; border-radius: 4px; color: #93c5fd; }
  a { color: #93c5fd; }
</style>
</head>
<body>
  <div class="card">
    <h1>Artado Proxy</h1>
    <div class="sub">Arama motoru proxy hizmeti — motor durumu</div>
    <div class="summary ${allOk ? "ok" : "down"}">${allOk ? "✓ Tüm motorlar çalışıyor" : "⚠ Bazı motorlarda sorun var"}</div>
    <table>
      <thead><tr><th>Motor</th><th>Durum</th><th>Yanıt Süresi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="endpoints">
      <strong>API uç noktaları:</strong>
      <ul>
        <li><code>GET /api?q=...&number=10&source=google|bing|all</code></li>
        <li><code>GET /api/images?q=...&number=10</code></li>
        <li><code>GET /api/news?q=...&number=10</code></li>
        <li><code>GET /api/videos?q=...&number=10</code></li>
        <li><code>GET /status</code> — servis yük durumu</li>
      </ul>
    </div>
  </div>
</body>
</html>`;
        res.setHeader("Content-Type", "text/html; charset=UTF-8");
        return res.status(200).send(html);
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

app.get("/api", async (req, res) => {
    try {
        const query = req.query.q as string;
        const nRaw = req.query.number as string;
        const n = Number.parseInt(nRaw || "10", 10);

        if (!query || !query.trim()) {
            return res.status(400).json({ error: "Missing required parameter: q" });
        }

        const querysource = req.query.source as string;
        const source = (querysource || "").toLowerCase();

        if (!source) {
            return res.status(400).json({ error: "Missing required parameter: source" });
        }

        if (!Number.isFinite(n) || n <= 0) {
            return res.status(400).json({ error: "Invalid parameter: number" });
        }

        let results: Results[] = [];

        switch (source) {
            case "google":
                results = await getGoogle(query, n);
                break;
            case "bing":
                results = await getBing(query, n);
                break;
            case "all": {
                const [google, bing] = await Promise.all([
                    getGoogle(query, n),
                    getBing(query, n)
                ]);
                results = mergeResults(google, bing);
                break;
            }
            default:
                return res.status(400).json({ error: "Invalid source. Use google, bing or all." });
        }

        res.setHeader('Content-Type', 'application/json; charset=UTF-8');
        return res.status(200).json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
})

app.get("/api/images", async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query || !query.trim()) {
            return res.status(400).json({ error: "Missing required parameter: q" });
        }
        const n = Number.parseInt((req.query.number as string) || "10", 10);
        if (!Number.isFinite(n) || n <= 0) {
            return res.status(400).json({ error: "Invalid parameter: number" });
        }
        const results = await getImages(query, n);
        res.setHeader("Content-Type", "application/json; charset=UTF-8");
        return res.status(200).json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

app.get("/api/news", async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query || !query.trim()) {
            return res.status(400).json({ error: "Missing required parameter: q" });
        }
        const n = Number.parseInt((req.query.number as string) || "10", 10);
        if (!Number.isFinite(n) || n <= 0) {
            return res.status(400).json({ error: "Invalid parameter: number" });
        }
        const results = await getNews(query, n);
        res.setHeader("Content-Type", "application/json; charset=UTF-8");
        return res.status(200).json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

app.get("/api/videos", async (req, res) => {
    try {
        const query = req.query.q as string;
        if (!query || !query.trim()) {
            return res.status(400).json({ error: "Missing required parameter: q" });
        }
        const n = Number.parseInt((req.query.number as string) || "10", 10);
        if (!Number.isFinite(n) || n <= 0) {
            return res.status(400).json({ error: "Invalid parameter: number" });
        }
        const results = await getVideos(query, n);
        res.setHeader("Content-Type", "application/json; charset=UTF-8");
        return res.status(200).json(results);
    } catch (error) {
        console.error(error);
        return res.status(500).send("Internal Server Error");
    }
});

app.use('/api', limiter);

app.get('/status', (req: Request, res: Response) => {
    const status = requestCount > REQUEST_THRESHOLD ? 'BUSY' : 'OK';
    res.send(status);
});

setInterval(() => {
    requestCount = 0;
    console.log('Request count reset to 0');
}, RESET_INTERVAL);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
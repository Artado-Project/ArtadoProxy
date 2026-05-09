import express, { Request, Response, NextFunction } from 'express';
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import { load } from "cheerio";
import { Results, ImageResult, NewsResult, VideoResult } from "./results";
import * as iconv from 'iconv-lite';

const rateLimit = require('express-rate-limit');

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
    "Accept-Language": "en-US,en;q=0.9"
};

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
    const results: Results[] = [];
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));
    const seenUrls = new Set<string>();

    try {
        const response = await axios.post(
            "https://www.startpage.com/sp/search",
            new URLSearchParams({ q, language: "english", num: String(limit) }).toString(),
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
        console.error("Error fetching from Startpage (Google):", error);
    }

    for (const result of results) {
        console.log(result.title)
        console.log(result.description)
        console.log(result.url)
        console.log(`\n`)
    }

    return results;
}

async function getBing(q: string, n: number): Promise<Results[]> {
    const results: Results[] = [];
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));

    const response = await axios.get("https://www.bing.com/search", {
        params: {
            q,
            count: limit,
            format: "rss",
            setlang: "en"
        },
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

        if (!title || !url) {
            return;
        }

        const result: Results = {
            title,
            description,
            displayUrl: normalizeDisplayUrl(url),
            url,
            source: "Bing"
        };
        results.push(result);
    });

    for (const result of results) {
        console.log(result.title)
        console.log(result.description)
        console.log(result.url)
        console.log(`\n`)
    }

    return results;
}

async function getAll(json1: Results[], json2: Results[]): Promise<Results[]> {
    const map = new Map<string, Results>();

    console.log('Adding items from json1:');
    json1.forEach(item => {
        console.log(`Adding: ${item.title}`);
        map.set(item.title, item);
    });

    console.log('Adding items from json2:');
    json2.forEach(item => {
        if (!map.has(item.title)) {
            console.log(`Adding: ${item.title}`);
            map.set(item.title, item);
        } else {
            console.log(`Skipping duplicate: ${item.title}`);
        }
    });

    const results: Results[] = Array.from(map.values());

    return results;
}


async function getImages(q: string, n: number): Promise<ImageResult[]> {
    const results: ImageResult[] = [];
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));

    try {
        const response = await axios.get("https://www.bing.com/images/search", {
            params: { q, count: limit, first: 1 },
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
        console.error("Error fetching images from Bing:", error);
    }

    return results;
}

async function getNews(q: string, n: number): Promise<NewsResult[]> {
    const results: NewsResult[] = [];
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));

    try {
        const response = await axios.get("https://www.bing.com/news/search", {
            params: { q, count: limit, format: "rss", setlang: "en" },
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
        console.error("Error fetching news from Bing:", error);
    }

    return results;
}

async function getVideos(q: string, n: number): Promise<VideoResult[]> {
    const results: VideoResult[] = [];
    const limit = Math.max(1, Math.min(50, Number.isFinite(n) ? n : 10));

    try {
        const response = await axios.get("https://www.bing.com/videos/search", {
            params: { q, count: limit },
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
        console.error("Error fetching videos from Bing:", error);
    }

    return results;
}

app.get("/", (req, res) => {
    return res.status(200).send({ response: "Artado Proxy is running!" });
});

app.get("/api", async (req, res) => {
    try {
        const query = req.query.q as string;
        console.log(query);

        const nRaw = req.query.number as string;
        const n = Number.parseInt(nRaw || "10", 10);
        console.log(nRaw);

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
            case "all":
                const bing = await getBing(query, n);
                const google = await getGoogle(query, n);
                results = await getAll(google, bing);
                break;
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
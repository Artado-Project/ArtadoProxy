import * as cheerio from 'cheerio';
import type { NewsResult } from '../types.js';

export interface NewsEngine {
    id: string;
    search(params: { query: string; limit: number; pageno?: number; signal?: AbortSignal }): Promise<NewsResult[]>;
}

async function scrapeGoogleRSS(query: string, signal?: AbortSignal): Promise<NewsResult[]> {
    try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;
        const res = await fetch(url, { signal });
        const xml = await res.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        const results: NewsResult[] = [];

        $('item').each((_, el) => {
            const title = $(el).find('title').text();
            const link = $(el).find('link').text();
            const source = $(el).find('source').text();
            const pubDate = $(el).find('pubDate').text();
            const description = $(el).find('description').text();
            
            // RSS'ten resim URL'si almayı dene
            let imageUrl = '';
            if (description) {
                const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/);
                if (imgMatch) {
                    imageUrl = imgMatch[1];
                }
            }

            if (title && link) {
                results.push({
                    engine: 'google-news',
                    title,
                    url: link,
                    source: source || 'Haber Kaynağı',
                    publishDate: pubDate,
                    snippet: description.replace(/<[^>]*>/g, '').substring(0, 200),
                    imageUrl: imageUrl || undefined
                });
            }
        });
        return results;
    } catch (e) {
        return [];
    }
}

async function scrapeDuckDuckGoNews(query: string, signal?: AbortSignal): Promise<NewsResult[]> {
    try {
        const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}&iar=news`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' },
            signal
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        const results: NewsResult[] = [];

        $('.result--news').each((_, el) => {
            const title = $(el).find('.result__title').text().trim();
            const link = $(el).find('.result__title a').attr('href') || '';
            const source = $(el).find('.result__url').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            
            // Resim URL'sini almayı dene
            let imageUrl = '';
            const imgEl = $(el).find('img');
            if (imgEl.length > 0) {
                imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || '';
            }

            if (title && link) {
                results.push({
                    engine: 'google-news',
                    title,
                    url: link.startsWith('http') ? link : `https:${link}`,
                    source: source,
                    snippet: snippet,
                    publishDate: '',
                    imageUrl: imageUrl || undefined
                });
            }
        });
        return results;
    } catch (e) {
        return [];
    }
}

export const googleNews: NewsEngine = {
    id: 'google-news',
    async search({ query, limit, pageno = 1, signal }) {
        // İki kaynağı paralel çağır
        const [googleRes, ddgRes] = await Promise.allSettled([
            scrapeGoogleRSS(query, signal),
            scrapeDuckDuckGoNews(query, signal)
        ]);

        let combined: NewsResult[] = [];
        if (googleRes.status === 'fulfilled') combined.push(...googleRes.value);
        if (ddgRes.status === 'fulfilled') combined.push(...ddgRes.value);

        // --- DUPLICATE KONTROLÜ ---
        const seen = new Set<string>();
        const finalResults = combined.filter(article => {
            // URL'nin başını ve başlığı kullanarak benzersiz bir anahtar oluştur
            const urlId = article.url.split('?')[0].toLowerCase().trim();
            const titleId = article.title.toLowerCase().substring(0, 30);
            const combinedId = `${urlId}-${titleId}`;

            if (seen.has(combinedId)) return false;
            seen.add(combinedId);
            return true;
        });

        if (finalResults.length === 0) {
            throw new Error('no_news_results_found');
        }

        // Paginasyon simülasyonu
        const start = (pageno - 1) * limit;
        return finalResults.slice(start, start + limit);
    }
};

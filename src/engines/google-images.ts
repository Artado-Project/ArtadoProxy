import * as cheerio from 'cheerio';
import type { ImageResult } from '../types.js';

export interface ImageEngine {
  id: string;
  search(params: { query: string; limit: number; pageno?: number; signal?: AbortSignal }): Promise<ImageResult[]>;
}

// --- ALT MOTORLAR (Scraping) ---

const bingScraper = async (query: string, limit: number, pageno: number): Promise<ImageResult[]> => {
  const first = (pageno - 1) * limit;
  const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&first=${first}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: ImageResult[] = [];
  $('.iusc').each((_, el) => {
    const m = $(el).attr('m');
    if (m) {
      const data = JSON.parse(m);
      results.push({ engine: 'bing', title: data.t || '', url: data.murl, thumbnail: data.turl, source: data.purl });
    }
  });
  return results;
};

const yandexScraper = async (query: string, pageno: number): Promise<ImageResult[]> => {
  const url = `https://yandex.com.tr/gorsel/search?text=${encodeURIComponent(query)}&p=${pageno - 1}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15' } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const results: ImageResult[] = [];
  $('.serp-item').each((_, el) => {
    const dataBem = $(el).attr('data-bem');
    if (dataBem) {
      const data = JSON.parse(dataBem)['serp-item'];
      results.push({ engine: 'yandex', title: data.snippet?.title || '', url: data.img_href, thumbnail: data.thumb?.url, source: data.snippet?.url });
    }
  });
  return results;
};

// --- ANA EXPORT (Servisinizin beklediği isim) ---

export const googleImages: ImageEngine = {
  id: 'google-images',
  async search({ query, limit, pageno = 1, signal }) {
    // Tüm kaynakları paralel çalıştır
    const [bingRes, yandexRes] = await Promise.allSettled([
      bingScraper(query, limit, pageno),
      yandexScraper(query, pageno)
    ]);

    let combined: ImageResult[] = [];
    if (bingRes.status === 'fulfilled') combined.push(...bingRes.value);
    if (yandexRes.status === 'fulfilled') combined.push(...yandexRes.value);

    // Duplicate Filtresi
    const seen = new Set();
    const unique = combined.filter(item => {
      const id = item.url.toLowerCase();
      return seen.has(id) ? false : seen.add(id);
    });

    if (unique.length === 0) throw new Error('no_results_found');
    return unique.slice(0, limit);
  }
};

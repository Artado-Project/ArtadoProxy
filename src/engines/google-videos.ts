import * as cheerio from 'cheerio';
import type { VideoResult } from '../types.js';

export interface VideoEngine {
    id: string;
    search(params: { query: string; limit: number; pageno?: number; signal?: AbortSignal }): Promise<VideoResult[]>;
}

// --- 1. DUCKDUCKGO VIDEOS (En dayanıklı yöntem) ---
async function scrapeDDGVideos(query: string, signal?: AbortSignal): Promise<VideoResult[]> {
    try {
        // DDG'nin HTML sürümü botlara karşı daha toleranslıdır
        const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query + ' video')}`;
        const res = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            signal
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        const results: VideoResult[] = [];

        $('.result').each((_, el) => {
            const link = $(el).find('.result__a').attr('href') || '';
            // Sadece video platformu içeren linkleri al (Youtube, Vimeo, vb.)
            if (link.includes('youtube.com') || link.includes('vimeo') || link.includes('dailymotion') || link.includes('watch')) {
                results.push({
                    engine: 'google-videos',
                    title: $(el).find('.result__a').text().trim(),
                    url: link,
                    thumbnail: '', // HTML sürümünde zor bulunur
                    channel: $(el).find('.result__url').text().trim()
                });
            }
        });
        return results;
    } catch { return []; }
}

// --- 2. BING VIDEOS (Seçiciler Güncellendi) ---
async function scrapeBingVideos(query: string, limit: number, pageno: number, signal?: AbortSignal): Promise<VideoResult[]> {
    try {
        const first = (pageno - 1) * limit;
        const url = `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}&first=${first}&setmkt=tr-TR`;
        
        const res = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept-Language': 'tr-TR,tr;q=0.9'
            },
            signal
        });
        
        const html = await res.text();
        const $ = cheerio.load(html);
        const results: VideoResult[] = [];

        // Bing bazen sınıf isimlerini değiştirir, farklı seçicileri deniyoruz
        $('.dg_u, .mc_vtvc, .tdg_u').each((_, el) => {
            const title = $(el).find('.mc_vtvc_title, .title').text().trim();
            const link = $(el).find('a').attr('href') || '';
            const thumb = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';

            if (title && link) {
                results.push({
                    engine: 'google-videos',
                    title,
                    url: link.startsWith('http') ? link : `https://www.bing.com${link}`,
                    thumbnail: thumb,
                    duration: $(el).find('.vtvc_v_dur, .duration').text().trim()
                });
            }
        });
        return results;
    } catch { return []; }
}

export const googleVideos: VideoEngine = {
    id: 'google-videos',
    async search({ query, limit, pageno = 1, signal }) {
        // Motorları sırayla değil, paralel çalıştırıyoruz
        const [bing, ddg] = await Promise.allSettled([
            scrapeBingVideos(query, limit, pageno, signal),
            scrapeDDGVideos(query, signal)
        ]);

        let combined: VideoResult[] = [];
        if (bing.status === 'fulfilled') combined.push(...bing.value);
        if (ddg.status === 'fulfilled') combined.push(...ddg.value);

        // URL üzerinden Duplicate kontrolü
        const seen = new Set<string>();
        const finalResults = combined.filter(vid => {
            const id = vid.url.toLowerCase().trim();
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        if (finalResults.length === 0) {
            // Hiç sonuç yoksa, en azından boş dönmek yerine hata fırlatıyoruz 
            // ki frontend'de 'Sonuç bulunamadı' mesajı çıksın.
            throw new Error('no_results_found');
        }

        return finalResults.slice(0, limit);
    }
};

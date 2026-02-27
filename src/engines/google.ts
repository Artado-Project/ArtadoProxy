import { loadHtml } from '../html/load.js';
import type { SearchResult } from '../types.js';
import type { Engine } from './engine.js';

export const google: Engine = {
  id: 'google',
  async search({ query, limit, pageno = 1, signal }) {
    const start = (pageno - 1) * 10;
    
    // Daha az şüpheli strateji: Normal tarayıcı taklidi ve daha basit parametreler
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${start}&num=${limit}&hl=tr&gl=tr`;

    const res = await fetch(url, {
      headers: {
        // Windows Chrome User-Agent - daha yaygın ve az şüpheli
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      signal
    });

    const html = await res.text();
    const $ = loadHtml(html);
    const out: SearchResult[] = [];

    // Google'ın farklı HTML yapılarını destekleyen seçiciler
    $('.g, .MjjYud, .tF2Cxc, .xpd').each((_, el) => {
      if (out.length >= limit) return;

      const $el = $(el);
      
      // Başlık için birden fazla seçici dene
      const title = $el.find('h3, .DKV0Md, .yDYNvb, .LC20lb').first().text().trim();
      
      // URL için farklı yöntemler dene
      let rawUrl = $el.find('a').first().attr('href') || '';
      
      // Google yönlendirme URL'lerini temizle
      if (rawUrl && rawUrl.startsWith('/url?q=')) {
        try {
          const urlObj = new URL(rawUrl, 'https://www.google.com');
          rawUrl = urlObj.searchParams.get('q') || rawUrl;
        } catch (e) {
          // URL ayrıştırma başarısız olursa orijinali kullan
        }
      }

      // Snippet için birden fazla seçici
      const snippet = $el.find('.VwiC3b, .BNeawe, .yXK7S, .s, .aCOpRe').text().trim();

      if (title && rawUrl && rawUrl.startsWith('http') && !rawUrl.includes('google.com')) {
        out.push({
          engine: 'google',
          title,
          url: rawUrl,
          snippet: snippet || undefined
        });
      }
    });

    // Hata analizi
    if (out.length === 0) {
      const lowerHtml = html.toLowerCase();
      
      // Captcha veya blok kontrolü
      if (lowerHtml.includes('captcha') || 
          lowerHtml.includes('/sorry/') || 
          lowerHtml.includes('unusual traffic') ||
          lowerHtml.includes('robot') ||
          res.status === 429) {
        throw new Error(`blocked_or_captcha status=${res.status} url="google"`);
      }

      // HTML uzunluğunu kontrol et - boş sayfa mı?
      if (html.length < 1000) {
        console.error(`Google returned very short HTML: ${html.slice(0, 200)}`);
        throw new Error(`empty_or_invalid_response status=${res.status} url="google"`);
      }

      // Sonuç bulunamadı ama HTML normal
      console.error(`Google parsing failed. HTML length: ${html.length}. Contains search results: ${lowerHtml.includes('search')}`);
      throw new Error(`no_results_or_selector_mismatch status=${res.status} url="google"`);
    }

    return out;
  }
};

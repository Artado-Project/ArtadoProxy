import type { Engine } from './engine.js';
import type { SearchResult } from '../types.js';
import { fetchHtml } from '../http/fetchHtml.js';
import { loadHtml } from '../html/load.js';
import type { AnyNode } from 'domhandler';

export const startpage: Engine = {
  id: 'startpage',
  async search({ query, limit, signal }) {
    // Startpage'in doğrudan arama URL'i
    const reqUrl = `https://www.startpage.com/do/search?query=${encodeURIComponent(query)}&cat=web&pl=ext-ff&extVersion=1.3.0`;
    
    const { html } = await fetchHtml(reqUrl, { 
      signal, 
      timeoutMs: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      }
    });
    
    const $ = loadHtml(html);
    const results: SearchResult[] = [];

    // Startpage'in farklı sonuç container'larını dene
    $('.w-gl__result, .result, .search-result, [data-testid="result"]').each((_, el) => {
      if (results.length >= limit) return;

      const $el = $(el);
      
      // Başlık için birden fazla seçici
      const title = $el.find('h3, .w-gl__result-title, .result-title, a[data-testid="result-title"]').first().text().trim();
      
      // URL için ana linki bul
      const $link = $el.find('a[href]').first();
      const url = $link.attr('href') || '';
      
      // Snippet için açıklama metnini bul
      const snippet = $el.find('.w-gl__description, .result-description, p, .description').first().text().trim();

      if (title && url && url.startsWith('http')) {
        results.push({ 
          engine: 'startpage', 
          title, 
          url, 
          snippet: snippet || undefined 
        });
      }
    });

    // Eğer hala sonuç bulunamadıysa, alternatif seçicileri dene
    if (results.length === 0) {
      $('a[href*="http"]').each((_, el) => {
        if (results.length >= limit) return;
        
        const $el = $(el);
        const url = $el.attr('href') || '';
        const title = $el.text().trim();
        
        // Sadece dış linkleri al ve startpage domain'lerini çıkar
        if (title && url && url.startsWith('http') && !url.includes('startpage.com')) {
          // Başlık çok uzunsa veya anlamsızsa atla
          if (title.length > 5 && title.length < 200) {
            results.push({ 
              engine: 'startpage', 
              title, 
              url 
            });
          }
        }
      });
    }

    return results;
  }
};

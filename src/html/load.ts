import * as cheerio from 'cheerio';

export type CheerioApi = cheerio.CheerioAPI;

export function loadHtml(html: string): CheerioApi {
  return cheerio.load(html);
}

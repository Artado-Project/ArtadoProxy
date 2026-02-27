import { CookieJar } from './cookieJar.js';

export type FetchHtmlResult = {
  url: string;
  status: number;
  html: string;
  headers: Headers;
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function getSecChUa(ua: string): string {
  if (ua.includes('Chrome')) return '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"';
  return '';
}

const globalJar = new CookieJar();

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new Error('aborted'));
        },
        { once: true }
      );
    }
  });
}

export async function fetchHtml(
  url: string,
  opts?: {
    signal?: AbortSignal;
    timeoutMs?: number;
    jar?: CookieJar;
    headers?: Record<string, string>;
  }
): Promise<FetchHtmlResult> {
  const jar = opts?.jar ?? globalJar;
  const timeoutMs = Math.max(2000, Math.min(25000, opts?.timeoutMs ?? 15000));

  const maxAttempts = 2;
  let lastErr: unknown;

  const ua = opts?.headers?.['user-agent'] || getRandomUserAgent();
  const secChUa = getSecChUa(ua);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const signal = opts?.signal;
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      const headers = new Headers({
        'user-agent': ua,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7',
        'cache-control': 'max-age=0',
        'sec-ch-ua': secChUa,
        'sec-ch-ua-mobile': ua.includes('Mobile') ? '?1' : '?0',
        'sec-ch-ua-platform': ua.includes('Windows') ? '"Windows"' : ua.includes('Mac') ? '"macOS"' : ua.includes('Linux') ? '"Linux"' : '"iOS"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        ...(opts?.headers ?? {})
      });

      const cookie = jar.headerFor(url);
      if (cookie) headers.set('cookie', cookie);

      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers,
        signal: controller.signal
      });

      jar.setFromResponse(res.url, res.headers);

      const html = await res.text();
      clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);

      return { url: res.url, status: res.status, html, headers: res.headers };
    } catch (e) {
      clearTimeout(t);
      if (signal) signal.removeEventListener('abort', onAbort);
      lastErr = e;

      if (opts?.signal?.aborted) throw new Error('aborted');
      if (attempt < maxAttempts - 1) {
        // Add random jitter
        const jitter = Math.floor(Math.random() * 500);
        await sleep(500 + attempt * 1000 + jitter, opts?.signal).catch(() => { });
        continue;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('fetch failed');
}

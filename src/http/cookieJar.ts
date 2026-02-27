type Cookie = { name: string; value: string; domain: string; path: string };

function parseSetCookie(cookie: string, fallbackHost: string): Cookie | null {
  const parts = cookie.split(';').map((p) => p.trim());
  const [nv, ...attrs] = parts;
  const eq = nv.indexOf('=');
  if (eq <= 0) return null;
  const name = nv.slice(0, eq).trim();
  const value = nv.slice(eq + 1).trim();

  let domain = fallbackHost.toLowerCase();
  let path = '/';

  for (const a of attrs) {
    const [kRaw, vRaw] = a.split('=');
    const k = (kRaw || '').trim().toLowerCase();
    const v = (vRaw || '').trim();
    if (k === 'domain' && v) domain = v.toLowerCase().replace(/^\./, '');
    if (k === 'path' && v) path = v;
  }

  return { name, value, domain, path };
}

function domainMatches(host: string, domain: string): boolean {
  host = host.toLowerCase().replace(/^www\./, '');
  domain = domain.toLowerCase().replace(/^www\./, '');
  if (host === domain) return true;
  return host.endsWith('.' + domain);
}

function pathMatches(reqPath: string, cookiePath: string): boolean {
  if (!cookiePath) return true;
  if (!reqPath.startsWith('/')) reqPath = '/' + reqPath;
  if (!cookiePath.startsWith('/')) cookiePath = '/' + cookiePath;
  return reqPath.startsWith(cookiePath);
}

export class CookieJar {
  private cookies: Cookie[] = [];

  setFromResponse(url: string, headers: Headers): void {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    const setCookies: string[] = [];
    const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
    if (typeof anyHeaders.getSetCookie === 'function') {
      setCookies.push(...anyHeaders.getSetCookie());
    } else {
      const sc = headers.get('set-cookie');
      if (sc) setCookies.push(sc);
    }

    for (const sc of setCookies) {
      const parsed = parseSetCookie(sc, host);
      if (!parsed) continue;
      this.cookies = this.cookies.filter(
        (c) => !(c.name === parsed.name && c.domain === parsed.domain && c.path === parsed.path)
      );
      this.cookies.push(parsed);
    }
  }

  headerFor(url: string): string {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || '/';

    const pairs: string[] = [];
    for (const c of this.cookies) {
      if (!domainMatches(host, c.domain)) continue;
      if (!pathMatches(path, c.path)) continue;
      pairs.push(`${c.name}=${c.value}`);
    }
    return pairs.join('; ');
  }
}

/** Canonical job URLs are separate from share links, whose IDs are not posting IDs. */
export function normalizeWantedJobUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1_000) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!['www.wanted.co.kr', 'wanted.co.kr', 'recruit.wanted.co.kr'].includes(url.hostname)) return null;
    const id = url.pathname.match(/^\/wd\/([1-9]\d{0,11})\/?$/)?.[1];
    return id ? `https://www.wanted.co.kr/wd/${id}` : null;
  } catch { return null; }
}
function shareUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.hostname !== 'wntd.co' || url.username || url.password || url.port) return null;
    return /^\/[a-z\d_-]{1,100}\/?$/i.test(url.pathname) ? `https://wntd.co${url.pathname.replace(/\/$/, '')}` : null;
  } catch { return null; }
}
export function extractWantedJobUrl(value: string): string | null {
  for (const match of value.matchAll(/https?:\/\/[^\s<>"'\u2018\u2019\u201c\u201d]+/gi)) {
    const candidate = match[0].replace(/[\])},.;!?…」』】〉》»]+$/, '');
    const url = normalizeWantedJobUrl(candidate) || shareUrl(candidate);
    if (url) return url;
  }
  return null;
}

/** Follow only explicitly allowed hosts and never fetch an arbitrary redirect target. */
export async function resolveWantedJobUrl(value: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<string | null> {
  let next = extractWantedJobUrl(value);
  if (!next) return null;
  const localSignal = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
  const seen = new Set<string>();
  for (let hop = 0; hop < 5; hop++) {
    localSignal.throwIfAborted();
    const canonical = normalizeWantedJobUrl(next);
    if (canonical) return canonical;
    const short = shareUrl(next);
    if (!short || seen.has(short)) return null;
    seen.add(short);
    const response = await fetcher(short, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: localSignal });
    const location = response.headers.get('location');
    await response.body?.cancel().catch(() => undefined);
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
    try {
      const target = new URL(location, short);
      next = normalizeWantedJobUrl(target.href) || shareUrl(target.href);
    } catch { return null; }
    if (!next) return null;
  }
  return null;
}

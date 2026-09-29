import { extractWantedJobUrl, normalizeWantedJobUrl } from "../knowboth/wanted-url";

/** Follow only explicitly allowed hosts and never fetch an arbitrary redirect target. */
export async function resolveWantedJobUrl(
  value: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  let next = extractWantedJobUrl(value);
  if (!next) return null;
  const localSignal = AbortSignal.any([signal, AbortSignal.timeout(8_000)]);
  const seen = new Set<string>();
  for (let hop = 0; hop < 5; hop++) {
    localSignal.throwIfAborted();
    const canonical = normalizeWantedJobUrl(next);
    if (canonical) return canonical;
    const short = extractWantedJobUrl(next);
    if (!short || seen.has(short)) return null;
    seen.add(short);
    const response = await fetcher(short, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: localSignal,
    });
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
    try {
      const target = new URL(location, short);
      next = extractWantedJobUrl(target.href);
    } catch {
      return null;
    }
    if (!next) return null;
  }
  return null;
}

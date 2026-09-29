/** Canonical job URLs are separate from share links, whose IDs are not posting IDs. */
export function normalizeWantedJobUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1_000) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.port || !["https:", "http:"].includes(url.protocol)) return null;
    if (!["www.wanted.co.kr", "wanted.co.kr", "recruit.wanted.co.kr"].includes(url.hostname))
      return null;
    const id = url.pathname.match(/^\/wd\/([1-9]\d{0,11})\/?$/)?.[1];
    return id ? `https://www.wanted.co.kr/wd/${id}` : null;
  } catch {
    return null;
  }
}
function shareUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.hostname !== "wntd.co" ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    return /^\/[a-z\d_-]{1,100}\/?$/i.test(url.pathname)
      ? `https://wntd.co${url.pathname.replace(/\/$/, "")}`
      : null;
  } catch {
    return null;
  }
}
export function extractWantedJobUrl(value: string): string | null {
  for (const match of value.matchAll(/https?:\/\/[^\s<>"'\u2018\u2019\u201c\u201d]+/gi)) {
    const candidate = match[0].replace(/[\])},.;!?…」』】〉》»]+$/, "");
    const url = normalizeWantedJobUrl(candidate) || shareUrl(candidate);
    if (url) return url;
  }
  return null;
}

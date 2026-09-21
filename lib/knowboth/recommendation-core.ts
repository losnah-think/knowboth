import { normalizeWantedJobUrl as wantedPostingUrl } from './wanted-url';
/** Shared, dependency-free validation for live Wanted recommendations. */
export const MAX_CANDIDATES = 8;
export const MAX_RECOMMENDATIONS = 3;
export const MAX_PAGE_BYTES = 1_000_000;

export type RecommendationProfile = {
  experienceText: string;
  desiredWork: string | null;
  constraints: string | null;
  additionalAnswers: Array<{ question: string; answer: string }>;
};
export type RecommendationJob = {
  sourceUrl: string | null;
  companyDisplayName: string;
  positionTitle: string;
};
export type VerifiedPosting = {
  id: string;
  url: string;
  company: string;
  position: string;
  text: string;
  availability: 'accepting' | 'check_required';
  availabilityEvidence: string | null;
  deadline: string | null;
  checkedAt: string;
};
export type Recommendation = Omit<VerifiedPosting, 'text'> & {
  matches: Array<{ profileQuote: string; jobQuote: string; explanation: string }>;
  conditions: Array<{ conditionQuote: string; jobQuote: string | null; status: 'supported' | 'unknown'; explanation: string }>;
};
export type RecommendationResult = {
  status: 'ready' | 'empty';
  checkedAt: string;
  queries: string[];
  items: Recommendation[];
  message: string;
};

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function limitedText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}
export function evidenceText(value: string): string {
  return value.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
}
export function containsQuote(source: string, quote: unknown, minLength = 3): quote is string {
  return typeof quote === 'string' && evidenceText(quote).length >= minLength && evidenceText(source).includes(evidenceText(quote));
}
/** Do not turn a clipped "no experience" sentence into a positive match. */
export function hasExperienceQuote(source: string, quote: unknown): quote is string {
  if (!containsQuote(source, quote)) return false;
  const needle = evidenceText(quote);
  const sentences = source.replace(/([.!?。])\s+/g, '$1\n').split(/\n+/).map(evidenceText);
  const matches = sentences.filter(sentence => sentence.includes(needle));
  if (!matches.length) return false;
  const negative = /(?:경험|경력|역량).{0,15}(?:없|부족|아니)|(?:해본|해 본|구축한|담당한).{0,10}없|(?:하지|해보지|해 보지)\s*않|\b(?:no experience|never|have not|haven't|do not|don't)\b/i;
  return matches.some(sentence => !negative.test(sentence));
}
export function companyKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/주식회사|\(주\)|㈜|[\s.,()_-]/g, '');
}

export { normalizeWantedJobUrl as wantedPostingUrl } from './wanted-url';

export function consultedPostingUrls(output: unknown): Set<string> {
  const urls = new Set<string>();
  const add = (value: unknown) => { const url = wantedPostingUrl(value); if (url) urls.add(url); };
  const entries = record(output).output;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const item = record(entry);
    const action = record(item.action);
    if (item.type === 'web_search_call') {
      add(action.url);
      for (const source of Array.isArray(action.sources) ? action.sources : []) add(record(source).url);
    }
    if (item.type === 'message') for (const content of Array.isArray(item.content) ? item.content : []) {
      const annotations = record(content).annotations;
      for (const annotation of Array.isArray(annotations) ? annotations : []) add(record(annotation).url);
    }
  }
  return urls;
}

/** Keep searches job-related; raw CVs never go to the web-search request. */
export function redactContactDetails(value: string): string {
  return value
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[링크 제외]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[이메일 제외]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[연락처 제외]');
}
export function safeSearchQueries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap(item => {
    const text = limitedText(item, 100);
    if (!text || /[@/:\n\r<>]|\d{5,}/u.test(text)) return [];
    // Queries are phrases, not instructions or search operators.
    if (!/^[\p{L}\p{N}\s+#&().-]+$/u.test(text)) return [];
    return [text];
  }))].slice(0, 3);
}

export function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code: string) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] || entity;
    const point = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}
export function visibleText(html: string): string {
  return evidenceText(decodeEntities(html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')));
}
function jobPostingObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8) return [];
  if (Array.isArray(value)) return value.slice(0, 50).flatMap(item => jobPostingObjects(item, depth + 1));
  const item = record(value);
  const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
  if (types.includes('JobPosting')) return [item];
  return item['@graph'] ? jobPostingObjects(item['@graph'], depth + 1) : [];
}
function structuredPostings(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*['"]application\/ld\+json['"]/i.test(match[1])) continue;
    try { found.push(...jobPostingObjects(JSON.parse(match[2]))); } catch { /* Ignore malformed metadata. */ }
  }
  return found;
}
function postingIdentity(value: Record<string, unknown>, expectedUrl: string): boolean {
  if (typeof value.url === 'string') return wantedPostingUrl(value.url) === expectedUrl;
  const identifier = record(value.identifier).value ?? value.identifier;
  return typeof identifier === 'string' || typeof identifier === 'number'
    ? String(identifier) === expectedUrl.split('/').at(-1)
    : false;
}
function deadlineTime(value: string): number | null {
  // Date-only Korean deadlines end at midnight KST, not at the start of UTC day.
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999+09:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)) return null;
  const date = value.slice(0, 10);
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

/** An HTTP 200 alone is not proof that a posting is open. */
export function verifyPostingPage(input: {
  url: string; html: string; company: string; position: string; now: Date;
}): VerifiedPosting | null {
  const url = wantedPostingUrl(input.url);
  if (!url) return null;
  const html = input.html;
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1] || html;
  const pageText = visibleText(main);
  if (/(?:마감된\s*(?:채용\s*)?공고|종료된\s*(?:채용\s*)?공고|채용이\s*(?:마감|종료)|공고가\s*마감|채용\s*마감|마감되었습니다|채용이 종료되었습니다|존재하지 않는 공고|공고를 찾을 수 없)/i.test(pageText)) return null;
  const objects = structuredPostings(html);
  const identified = objects.filter(item => postingIdentity(item, url));
  // A lone unkeyed JobPosting is usable on an exact /wd/:id page, but not one with a different explicit identifier.
  const unkeyed = objects.length === 1 && !objects[0].url && !objects[0].identifier ? objects[0] : null;
  const job = identified.length === 1 ? identified[0] : unkeyed;
  if (objects.length && !job) return null;
  const metadataCompany = limitedText(record(job?.hiringOrganization).name, 200);
  const metadataPosition = limitedText(job?.title, 200);
  const company = metadataCompany || input.company;
  const position = metadataPosition || input.position;
  if ((!metadataCompany && !containsQuote(pageText, company, 1)) || (!metadataPosition && !containsQuote(pageText, position, 1))) return null;
  if (!company || !position) return null;
  // Search-result company/title must agree with the actual page, not with unrelated listing cards.
  if (companyKey(company) !== companyKey(input.company) || evidenceText(position) !== evidenceText(input.position)) return null;
  const description = typeof job?.description === 'string' ? visibleText(job.description) : '';
  const text = description ? `${company}\n${position}\n${description}` : pageText;
  if (text.length < 100 || !containsQuote(text, company, 1) || !containsQuote(text, position, 1)) return null;
  if (!description && (!/주요\s*업무|담당\s*업무|responsibilities/i.test(text) || !/자격\s*요건|지원\s*자격|requirements/i.test(text))) return null;
  const visibleDeadline = pageText.match(/(?:마감일|접수\s*마감|지원\s*마감일|마감기한)\s*[:：]?\s*(20\d{2})[./-]\s*(\d{1,2})[./-]\s*(\d{1,2})/);
  const fallbackDeadline = visibleDeadline ? `${visibleDeadline[1]}-${visibleDeadline[2].padStart(2, '0')}-${visibleDeadline[3].padStart(2, '0')}` : null;
  const rawDeadline = typeof job?.validThrough === 'string' ? job.validThrough : fallbackDeadline;
  const deadline = rawDeadline && deadlineTime(rawDeadline) !== null ? rawDeadline : null;
  if ([deadline, fallbackDeadline].some(value => value && deadlineTime(value) !== null && deadlineTime(value)! < input.now.getTime())) return null;
  let applyEvidence: string | null = null;
  for (const match of main.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)) {
    if (/\bdisabled\b|aria-disabled\s*=\s*['"]true['"]|\bhidden\b/i.test(match[2])) continue;
    const label = visibleText(match[3]);
    if (/^(?:지원하기|지원\s*신청|Apply(?:\s+now)?)$/i.test(label)) { applyEvidence = label; break; }
  }
  return {
    id: url.split('/').at(-1)!, url, company, position,
    text: text.slice(0, 20_000),
    availability: applyEvidence ? 'accepting' : 'check_required',
    availabilityEvidence: applyEvidence,
    deadline, checkedAt: input.now.toISOString(),
  };
}

/** Limit simultaneous page fetches and preserve input order. */
export async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, run: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new RangeError('concurrency must be a positive integer');
  const results = new Array<R>(items.length);
  let cursor = 0;
  let failed = false;
  let firstError: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const index = cursor++;
      try { signal?.throwIfAborted(); results[index] = await run(items[index], index); }
      catch (error) { failed = true; firstError ??= error; }
    }
  }));
  if (failed) throw firstError;
  return results;
}

export function validateMatches(raw: unknown, postings: VerifiedPosting[], profile: RecommendationProfile, originalCompany: string): Recommendation[] {
  const entries = record(raw).items;
  if (!Array.isArray(entries)) throw new Error('Invalid recommendation output');
  const byId = new Map(postings.map(posting => [posting.id, posting]));
  const seen = new Set<string>();
  const preferenceText = [profile.desiredWork, profile.constraints, ...profile.additionalAnswers.map(item => item.answer)].filter(Boolean).join('\n');
  const results: Recommendation[] = [];
  for (const value of entries.slice(0, MAX_CANDIDATES)) {
    const item = record(value);
    const posting = typeof item.postingId === 'string' ? byId.get(item.postingId) : undefined;
    if (!posting || companyKey(posting.company) === companyKey(originalCompany) || seen.has(companyKey(posting.company))) continue;
    const matches = (Array.isArray(item.matches) ? item.matches : []).flatMap(value => {
      const match = record(value);
      const explanation = limitedText(match.explanation, 600);
      if (!explanation || !limitedText(match.profileQuote, 600) || !limitedText(match.jobQuote, 600) || !hasExperienceQuote(profile.experienceText, match.profileQuote) || !containsQuote(posting.text, match.jobQuote)) return [];
      return [{ profileQuote: match.profileQuote.trim(), jobQuote: match.jobQuote.trim(), explanation }];
    }).slice(0, 3);
    if (!matches.length) continue;
    let conflict = false;
    const conditions: Recommendation['conditions'] = [];
    for (const value of (Array.isArray(item.conditions) ? item.conditions : []).slice(0, 8)) {
      const condition = record(value);
      if (!containsQuote(preferenceText, condition.conditionQuote)) continue;
      const supportedQuote = containsQuote(posting.text, condition.jobQuote) ? condition.jobQuote.trim() : null;
      if (condition.status === 'conflict' && supportedQuote) { conflict = true; break; }
      const supported = condition.status === 'supported' && supportedQuote;
      conditions.push({
        conditionQuote: condition.conditionQuote.trim(),
        jobQuote: supported ? supportedQuote : null,
        status: supported ? 'supported' : 'unknown',
        explanation: supported ? limitedText(condition.explanation, 600) || '공고에 연결되는 조건이 있어요. 실제 적용 범위는 확인해 주세요.' : '공고 원문에서 이 조건의 충족 여부를 확인하지 못했어요.',
      });
    }
    if (conflict) continue;
    // Never let the model silently omit the user's requested conditions.
    for (const preference of [profile.desiredWork, profile.constraints].filter((text): text is string => Boolean(text))) {
      if (!conditions.some(condition => evidenceText(preference) === evidenceText(condition.conditionQuote))) {
        conditions.push({ conditionQuote: preference, jobQuote: null, status: 'unknown', explanation: '희망 조건의 충족 여부를 추가로 확인해 주세요.' });
      }
    }
    const { text: _text, ...publicPosting } = posting;
    void _text;
    results.push({ ...publicPosting, matches, conditions });
    seen.add(companyKey(posting.company));
  }
  return results.sort((a, b) => Number(b.availability === 'accepting') - Number(a.availability === 'accepting')).slice(0, MAX_RECOMMENDATIONS);
}

/** Defensive client parsing: do not render unvalidated links or malformed responses. */
export function parseRecommendationResult(value: unknown): RecommendationResult | null {
  const data = record(value);
  if (!['ready', 'empty'].includes(String(data.status)) || !limitedText(data.message, 1_000)
    || typeof data.checkedAt !== 'string' || !Number.isFinite(Date.parse(data.checkedAt))
    || !Array.isArray(data.queries) || !Array.isArray(data.items) || data.items.length > MAX_RECOMMENDATIONS) return null;
  const queries = safeSearchQueries(data.queries);
  if (!queries.length || queries.length !== data.queries.length) return null;
  const items: Recommendation[] = [];
  for (const value of data.items) {
    const item = record(value);
    const url = wantedPostingUrl(item.url);
    if (!url || url !== item.url || item.id !== url.split('/').at(-1)
      || !limitedText(item.company, 200) || !limitedText(item.position, 200)
      || !['accepting', 'check_required'].includes(String(item.availability))
      || !(item.availabilityEvidence === null || limitedText(item.availabilityEvidence, 100))
      || (item.availability === 'accepting' && !limitedText(item.availabilityEvidence, 100))
      || !(item.deadline === null || (typeof item.deadline === 'string' && deadlineTime(item.deadline) !== null))
      || typeof item.checkedAt !== 'string' || !Number.isFinite(Date.parse(item.checkedAt))
      || !Array.isArray(item.matches) || item.matches.length < 1 || item.matches.length > 3
      || !Array.isArray(item.conditions) || item.conditions.length > 10) return null;
    const matches: Recommendation['matches'] = [];
    for (const value of item.matches) {
      const match = record(value);
      const profileQuote = limitedText(match.profileQuote, 600), jobQuote = limitedText(match.jobQuote, 600), explanation = limitedText(match.explanation, 600);
      if (!profileQuote || !jobQuote || !explanation) return null;
      matches.push({ profileQuote, jobQuote, explanation });
    }
    const conditions: Recommendation['conditions'] = [];
    for (const value of item.conditions) {
      const condition = record(value);
      const conditionQuote = limitedText(condition.conditionQuote, 2_000), explanation = limitedText(condition.explanation, 600);
      if (!conditionQuote || !explanation || !['supported', 'unknown'].includes(String(condition.status))) return null;
      if (condition.status === 'supported' && !limitedText(condition.jobQuote, 600)) return null;
      if (condition.status === 'unknown' && condition.jobQuote !== null) return null;
      conditions.push({ conditionQuote, explanation, status: condition.status as 'supported' | 'unknown', jobQuote: condition.jobQuote as string | null });
    }
    items.push({
      id: item.id as string, url, company: item.company as string, position: item.position as string,
      availability: item.availability as Recommendation['availability'], availabilityEvidence: item.availabilityEvidence as string | null,
      deadline: item.deadline as string | null, checkedAt: item.checkedAt, matches, conditions,
    });
  }
  if ((data.status === 'ready') !== (items.length > 0)) return null;
  return { status: data.status as 'ready' | 'empty', checkedAt: data.checkedAt, queries, items, message: data.message as string };
}

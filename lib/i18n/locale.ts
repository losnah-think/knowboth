export const locales = ["en", "ko"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "knowboth-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ko";
}

export function resolveLocale(value: unknown, fallback: Locale = defaultLocale): Locale {
  return isLocale(value) ? value : fallback;
}

export function localeTag(locale: Locale) {
  return locale === "ko" ? "ko-KR" : "en-US";
}

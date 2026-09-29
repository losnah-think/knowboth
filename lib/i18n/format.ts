import { localeTag, type Locale } from "./locale";

export function dateLabel(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(localeTag(locale), {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(date);
}

export function moneyLabel(value: string, currency: string, locale: Locale) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  if (locale === "ko" && currency === "KRW" && Math.abs(amount) >= 100_000_000) {
    return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(amount / 100_000_000)}억 원`;
  }
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(amount);
}

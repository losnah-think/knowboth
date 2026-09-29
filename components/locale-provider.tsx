"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(
  null,
);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocale] = useState(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].pageTitle;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", messages[locale].pageDescription);
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [locale]);

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used within LocaleProvider");
  return { ...context, copy: messages[context.locale] };
}

export function LanguageSwitcher({ disabled = false }: { disabled?: boolean }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className="kb-languages" role="group" aria-label={locale === "en" ? "Language" : "언어"}>
      {(
        [
          ["en", "English"],
          ["ko", "한국어"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={locale === value}
          disabled={disabled}
          onClick={() => setLocale(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/components/locale-provider";
import { LOCALE_COOKIE, resolveLocale } from "@/lib/i18n/locale";
import { messages } from "@/lib/i18n/messages";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    title: messages[locale].pageTitle,
    description: messages[locale].pageDescription,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}

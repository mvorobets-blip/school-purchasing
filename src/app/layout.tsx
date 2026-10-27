import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, Onest } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_COOKIE, THEME_SCRIPT, themeFromCookie } from "@/lib/theme";
import "./globals.css";

// Onest — основний шрифт інтерфейсу (DESIGN.md §3): кирилиця й латиниця.
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "School Purchasing",
  description: "Purchase requests, approvals and department settings for the school",
};

// Тема: збережений вибір (cookie) — одразу в HTML з сервера; без нього THEME_SCRIPT ставить системну до малювання.
// suppressHydrationWarning — бо скрипт змінює data-theme на <html> до гідратації.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = themeFromCookie((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={theme}
      suppressHydrationWarning
      className={`${onest.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}

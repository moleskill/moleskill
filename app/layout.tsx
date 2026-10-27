import "./globals.css";
import "@fontsource-variable/onest/wght.css";
import "@fontsource-variable/literata/wght.css";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import Script from "next/script";

const META = {
  ru: { title: "MoleSkill — краткое резюме встречи за минуту", description: "Загрузите запись встречи и получите резюме, решения и задачи со сроками." },
  en: { title: "MoleSkill — meeting minutes in a minute", description: "Upload a meeting recording and get a summary, decisions and action items with due dates." },
} as const;

export const metadata: Metadata = { ...META.ru, alternates: { languages: { ru: "/ru", en: "/en" } } };

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e1f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="min-h-dvh bg-bg font-sans text-fg antialiased">
        <Script id="theme-init" strategy="beforeInteractive">{`try { const saved = localStorage.getItem("theme") || "system"; const dark = saved === "dark" || (saved === "system" && matchMedia("(prefers-color-scheme: dark)").matches); document.documentElement.classList.toggle("dark", dark); document.documentElement.style.colorScheme = dark ? "dark" : "light"; } catch {}`}</Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

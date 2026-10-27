import Link from "next/link";
import { Link as LocaleLink } from "@/i18n/navigation";
import { getT } from "@/lib/i18n";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { LangSwitch } from "./lang-switch";
import { LogoutButton } from "./logout-button";

type Props = { variant?: "landing" | "app" | "auth"; authed?: boolean; email?: string };

export async function SiteHeader({ variant = "landing", authed = false, email }: Props) {
  const { t, lang } = await getT();
  return (
    <header className="site-header">
      <div className="site-header-inner mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="MoleSkill"><Logo /></Link>
        {variant === "landing" && (
          <nav className="site-header-nav hidden items-center gap-7 text-sm font-medium text-muted md:flex">
            <a href="#why" className="hover:text-fg">{t.navWhy}</a>
            <a href="#how" className="hover:text-fg">{t.navHow}</a>
            <a href="#faq" className="hover:text-fg">{t.navFaq}</a>
            <LocaleLink href="/donate" className="hover:text-fg">{lang === "ru" ? "Поддержать" : "Support"}</LocaleLink>
          </nav>
        )}
        <div className="site-header-actions flex items-center gap-2">
          {variant === "app" && email && <span className="mr-2 hidden max-w-[220px] truncate text-sm text-muted sm:inline">{email}</span>}
          <LangSwitch key={lang} lang={lang} label={t.language} />
          <ThemeToggle label={t.theme} />
          {variant === "app" ? (
            <LogoutButton label={t.logout} />
          ) : variant === "landing" ? (
            authed ? (
              <Link href="/dashboard" className="btn btn-primary">{t.openApp}</Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">{t.login}</Link>
                <Link href="/register" className="btn btn-primary">{t.register}</Link>
              </>
            )
          ) : null}
        </div>
      </div>
    </header>
  );
}

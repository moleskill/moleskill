import { SiteHeader } from "@/components/site-header";
import { getT } from "@/lib/i18n";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = await getT();
  return (
    <>
      <SiteHeader variant="auth" />
      <main className="auth-page mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-8 sm:min-h-[calc(100dvh-3.5rem)] sm:justify-center sm:px-8 sm:py-12">
        <div className="auth-stage w-full">
          <aside className="auth-story" aria-label={lang === "ru" ? "О MoleSkill" : "About MoleSkill"}>
            <div className="auth-story-top">
              <span className="auth-story-mark" aria-hidden="true"><span /><span /><span /></span>
              <span>MOLESKILL / {lang === "ru" ? "ВСТРЕЧИ" : "MEETINGS"}</span>
            </div>
            <div className="auth-story-copy">
              <p className="auth-story-kicker">{lang === "ru" ? "МЕНЬШЕ РУТИНЫ ПОСЛЕ ВСТРЕЧИ" : "LESS WORK AFTER EVERY MEETING"}</p>
              <h1>{lang === "ru" ? "Слушайте людей. MoleSkill запомнит главное." : "Listen to people. Let MoleSkill keep the details."}</h1>
              <p>{lang === "ru" ? "Краткие итоги, решения и задачи — в одном рабочем пространстве." : "Clear summaries, decisions, and action items in one workspace."}</p>
            </div>
            <div className="auth-story-note" aria-hidden="true">
              <div className="auth-note-head"><span>{lang === "ru" ? "ИТОГИ ВСТРЕЧИ" : "MEETING NOTES"}</span><i /></div>
              <strong>{lang === "ru" ? "Планирование запуска" : "Launch planning"}</strong>
              <div className="auth-note-line auth-note-line-wide" />
              <div className="auth-note-line" />
              <div className="auth-note-task"><i />{lang === "ru" ? "Подготовить план до пятницы" : "Prepare the plan by Friday"}</div>
            </div>
            <p className="auth-story-foot">{lang === "ru" ? "ВАШИ ВСТРЕЧИ. ВАШИ РЕШЕНИЯ. ВАШ ФОКУС." : "YOUR MEETINGS. YOUR DECISIONS. YOUR FOCUS."}</p>
          </aside>
          <div className="auth-form-column">
          <section className="auth-card">{children}</section>
          <p className="mt-5 text-center text-xs text-muted">{t.authTagline}</p>
          </div>
        </div>
      </main>
    </>
  );
}

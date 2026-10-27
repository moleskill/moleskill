import { Link } from "@/i18n/navigation";
import { getT } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { setRequestLocale } from "next-intl/server";

export default async function DonatePage({ params }: { params: Promise<{ locale: "ru" | "en" }> }) {
  setRequestLocale((await params).locale);
  const { lang } = await getT();
  const ru = lang === "ru";
  const youtube = process.env.NEXT_PUBLIC_YOUTUBE_URL;
  const donate = process.env.NEXT_PUBLIC_DONATION_URL;
  return <div className="landing-shell"><SiteHeader /><main className="info-page">
    <section className="info-hero"><p className="hero-eyebrow"><span aria-hidden="true" />{ru ? "ПОДДЕРЖКА MOLESKILL" : "SUPPORT MOLESKILL"}</p><h1>{ru ? "Бесплатный проект держится на людях" : "A free project, supported by people"}</h1><p>{ru ? "MoleSkill создаётся как бесплатный инструмент — как WinRAR и Википедия. Поддержка помогает оплачивать инфраструктуру и продолжать разработку." : "MoleSkill is built as a free tool, like WinRAR and Wikipedia. Your support helps pay for infrastructure and keeps development moving."}</p></section>
    <section className="support-options"><article className="support-option"><span className="option-index">01</span><h2>{ru ? "Поддержать донатом" : "Make a donation"}</h2><p>{ru ? "Любая сумма помогает покрыть серверы, хранение данных и обработку аудио. Это добровольная поддержка, доступ к функциям от неё не зависит." : "Every contribution helps cover servers, storage, and audio processing. Donations are optional and do not affect access to features."}</p>{donate ? <a className="btn btn-primary btn-lg" href={donate} target="_blank" rel="noreferrer">{ru ? "Перейти к донату" : "Go to donations"} ↗</a> : <span className="setup-note">{ru ? "Способ приёма донатов скоро появится." : "Donation options will be added soon."}</span>}</article>
      <article className="support-option"><span className="option-index">02</span><h2>{ru ? "Поддержать YouTube-канал" : "Support the YouTube channel"}</h2><p>{ru ? "Подпишитесь, смотрите видео и делитесь ими. Так о MoleSkill узнают новые люди, а проект получает возможность развиваться." : "Subscribe, watch, and share. It helps more people discover MoleSkill and gives the project room to grow."}</p>{youtube ? <a className="btn btn-ghost btn-lg" href={youtube} target="_blank" rel="noreferrer">{ru ? "Открыть YouTube" : "Visit YouTube"} ↗</a> : <span className="setup-note">{ru ? "Ссылка на канал скоро появится." : "The channel link will be added soon."}</span>}</article></section>
    <aside className="support-note"><h2>{ru ? "Открытая отчётность" : "Open reporting"}</h2><p>{ru ? "Публиковать доходы и расходы проекта будем на отдельной странице. Пока она готовится, там указано, что отчётность ещё не ведётся." : "Project income and expenses will be published on a separate page. Until then, it clearly says that reporting has not started."}</p><Link className="support-report" href="/finances">{ru ? "Перейти к финансовому отчёту" : "View the financial report"} →</Link></aside>
  </main><footer className="landing-footer"><div><Link href="/" className="footer-logo">MoleSkill</Link><Link href="/finances">{ru ? "Финансы" : "Finances"}</Link><Link href="/terms">{ru ? "Условия использования" : "Terms of Use"}</Link></div></footer></div>;
}

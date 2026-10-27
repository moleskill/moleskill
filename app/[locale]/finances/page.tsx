import { Link } from "@/i18n/navigation";
import { getT } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { setRequestLocale } from "next-intl/server";

export default async function FinancesPage({ params }: { params: Promise<{ locale: "ru" | "en" }> }) {
  setRequestLocale((await params).locale);
  const { lang } = await getT();
  const ru = lang === "ru";
  return <div className="landing-shell"><SiteHeader /><main className="info-page finances-page">
    <section className="info-hero"><p className="hero-eyebrow"><span aria-hidden="true" />{ru ? "ОТКРЫТЫЙ ПРОЕКТ" : "OPEN PROJECT"}</p><h1>{ru ? "Финансовый отчёт MoleSkill" : "MoleSkill financial report"}</h1><p>{ru ? "Здесь будут собираться доходы проекта и расходы на его инфраструктуру." : "This page will show project income and infrastructure costs."}</p></section>
    <section className="report-placeholder"><span className="report-status"><i />{ru ? "Отчётность ещё не началась" : "Reporting has not started yet"}</span><h2>{ru ? "Первый отчёт появится позже" : "The first report will be published later"}</h2><p>{ru ? "Сейчас проект не публикует финансовые данные. Когда начнут поступать донаты и появятся регулярные расходы, здесь будут даты, суммы и назначение расходов. Пока никаких цифр нет — мы не хотим создавать ложное впечатление о текущих доходах или затратах." : "The project is not publishing financial data yet. Once donations and recurring costs begin, this page will list dates, amounts, and expense categories. There are no figures yet; we do not want to imply income or costs that have not been recorded."}</p><div className="report-meta"><span>{ru ? "Период" : "Period"}</span><strong>{ru ? "Не начат" : "Not started"}</strong><span>{ru ? "Последнее обновление" : "Last updated"}</span><strong>—</strong></div></section>
    <div className="report-links"><Link className="btn btn-primary" href="/donate">{ru ? "Поддержать проект" : "Support the project"}</Link><Link className="support-report" href="/">{ru ? "На главную" : "Back home"} →</Link></div>
  </main><footer className="landing-footer"><div><Link href="/" className="footer-logo">MoleSkill</Link><Link href="/donate">{ru ? "Поддержать" : "Support"}</Link><Link href="/terms">{ru ? "Условия использования" : "Terms of Use"}</Link></div></footer></div>;
}

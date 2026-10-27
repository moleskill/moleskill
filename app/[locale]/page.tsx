import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { getT } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { Wave } from "@/components/wave";
import { LogoGlyph } from "@/components/logo";
import { setRequestLocale } from "next-intl/server";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Check({ size = 11 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} strokeWidth={2.6} aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}
const FEATURE_ICONS = [
  <svg key="s" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h7" /></svg>,
  <svg key="t" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="m8 12.2 2.8 2.8L16 9.5" /></svg>,
  <svg key="m" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>,
  <svg key="l" viewBox="0 0 24 24" {...stroke} aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>,
];

export default async function Home({ params }: { params: Promise<{ locale: "ru" | "en" }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { l, t, lang } = await getT();
  const cta = "/register";
  const copy = l.copy;
  const features = [
    { title: copy.featureOne, body: copy.featureOneSub },
    { title: copy.featureTwo, body: copy.featureTwoSub },
    { title: copy.featureThree, body: copy.featureThreeSub },
    { title: copy.featureFour, body: copy.featureFourSub },
  ];
  return (
    <div className="landing-shell">
      <SiteHeader />
      <main>
        <section className="landing-hero">
          <div className="landing-hero-grid" aria-hidden="true" />
          <div className="landing-hero-inner mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:px-10 lg:pb-28 lg:pt-24">
            <div className="landing-hero-copy relative z-10">
              <p className="hero-eyebrow"><span aria-hidden="true" />{copy.eyebrow}</p>
              <h1 className="hero-title text-balance text-[clamp(2.5rem,5.4vw,4.4rem)] font-semibold leading-[1.04] tracking-[-.045em]">{l.heroTitle}</h1>
              <p className="hero-sub mt-6 text-pretty text-base leading-7 sm:text-lg sm:leading-8">{l.heroSub}</p>
              <div className="hero-actions mt-8 flex flex-wrap items-center gap-3">
                <NextLink href={cta} className="btn btn-primary btn-lg hero-primary">{l.cta1}</NextLink>
                <Link href="/demo" className="hero-secondary">{copy.watchDemo} <span aria-hidden="true">↗</span></Link>
              </div>
              <div className="hero-trust"><span className="hero-trust-check"><Check /></span><span>{copy.trust}</span></div>
            </div>

            <div id="example" className="hero-product-stage mx-auto w-full max-w-[640px]" role="img" aria-label={l.demoLabel}>
              <div className="result-card" aria-hidden="true">
                <div className="result-topline"><div className="result-brand"><span className="result-mark"><LogoGlyph /></span><span>MoleSkill</span></div><span className="result-status"><i />{copy.transcriptLabel}</span></div>
                <div className="result-meeting"><div><span className="result-kicker">{copy.minutes}</span><h2>{l.demoLabel}</h2></div><span className="result-duration">32:08</span></div>
                <div className="audio-strip"><div className="audio-play"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.7c0-.6.65-.97 1.16-.66l6.16 3.8a.78.78 0 0 1 0 1.32l-6.16 3.8A.78.78 0 0 1 5 11.3V3.7Z" /></svg></div><Wave /><span className="audio-time">02:14 / 32:08</span></div>
                <div className="result-summary"><div className="result-section-label"><span className="summary-dot" />{copy.summary}</div><p>{l.demoSummary}</p></div>
                <div className="result-speakers"><div className="result-section-label"><span className="summary-dot" />{copy.speakers}</div><p><span className="spk" data-n="1">{t.speaker} 1</span>{copy.line1}</p><p><span className="spk" data-n="2">{t.speaker} 2</span>{copy.line2}</p></div>
                <div className="result-decision"><div className="result-section-label"><span className="decision-icon"><Check size={9} /></span>{copy.decisions}</div><p><mark>{copy.decisionText}</mark></p></div>
                <div className="result-tasks-head"><span>{copy.tasks}</span><span>{copy.done}</span></div>
                <div className="result-task-list">{l.demoTasks.map((task, i) => <div className="result-task" key={task.t}><span className={`task-check task-check-${i}`}>{i === 0 && <Check size={10} />}</span><span className="task-name">{task.t}</span><span className="task-owner">{task.w}</span><span className="task-date">{task.d}</span></div>)}</div>
              </div>
            </div>
          </div>
        </section>

        <section id="why" className="section-wrap">
          <div className="section-heading"><h2>{copy.whyTitle}</h2><p>{copy.whySub}</p></div>
          <div className="benefit-grid">{features.map((feature, i) => <article className="benefit-card" key={feature.title}><span className="benefit-icon">{FEATURE_ICONS[i]}</span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div>
        </section>

        <section id="how" className="landing-process">
          <div className="section-wrap"><div className="section-heading"><h2>{copy.howTitle}</h2></div><div className="process-grid">{l.steps.map((step, i) => <article className="process-step" key={step.t}><div className="process-marker"><span>{i + 1}</span><i /></div><h3>{step.t}</h3><p>{step.d}</p></article>)}</div></div>
        </section>

        <section className="landing-faq section-wrap" id="faq">
          <div className="faq-heading"><h2>{l.faqTitle}</h2></div>
          <div className="faq-list">{l.faq.map((item) => <details className="faq-item" key={item.q}><summary>{item.q}<span aria-hidden="true">+</span></summary><p>{item.a}</p></details>)}</div>
        </section>

        <section className="support-band section-wrap" aria-labelledby="support-heading">
          <div className="support-copy">
            <p className="hero-eyebrow"><span aria-hidden="true" />{lang === "ru" ? "БЕСПЛАТНЫЙ ПРОЕКТ" : "A FREE PROJECT"}</p>
            <h2 id="support-heading">{lang === "ru" ? "Бесплатно для всех. Вместе поддерживаем инфраструктуру." : "Free for everyone. Supported together."}</h2>
            <p>{lang === "ru" ? "MoleSkill останется бесплатным. Донаты помогают оплачивать серверы и обработку записей, а подписка на YouTube помогает проекту расти." : "MoleSkill will remain free. Donations help cover servers and audio processing; following the YouTube channel helps the project grow."}</p>
          </div>
          <div className="support-actions">
            <Link href="/donate" className="btn btn-primary btn-lg">{lang === "ru" ? "Поддержать проект" : "Support the project"}</Link>
            {process.env.NEXT_PUBLIC_YOUTUBE_URL && <a href={process.env.NEXT_PUBLIC_YOUTUBE_URL} target="_blank" rel="noreferrer" className="btn btn-ghost btn-lg">{lang === "ru" ? "YouTube-канал" : "YouTube channel"} ↗</a>}
            <Link href="/finances" className="support-report">{lang === "ru" ? "Финансовый отчёт" : "Financial report"}<span aria-hidden="true"> ↗</span></Link>
          </div>
        </section>

        <section className="landing-cta-wrap"><div className="landing-cta"><div className="cta-content"><h2>{copy.ctaTitle}</h2><p>{copy.ctaSub}</p><NextLink href={cta} className="btn btn-lg cta-button">{l.cta1}</NextLink></div></div></section>
      </main>
      <footer className="landing-footer"><div><span className="footer-logo"><span className="footer-logo-mark"><LogoGlyph /></span>MoleSkill</span><span>© {new Date().getFullYear()} MoleSkill</span><Link href="/terms" className="hover:text-fg">{lang === "ru" ? "Условия использования" : "Terms of Use"}</Link><Link href="/donate" className="hover:text-fg">{lang === "ru" ? "Поддержать" : "Support"}</Link><Link href="/finances" className="hover:text-fg">{lang === "ru" ? "Финансы" : "Finances"}</Link>{process.env.NEXT_PUBLIC_YOUTUBE_URL && <a href={process.env.NEXT_PUBLIC_YOUTUBE_URL} target="_blank" rel="noreferrer" className="hover:text-fg">YouTube ↗</a>}</div><span>{l.footer}</span></footer>
    </div>
  );
}

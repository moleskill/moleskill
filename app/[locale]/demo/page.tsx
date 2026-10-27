import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getT } from "@/lib/i18n";
import { setRequestLocale } from "next-intl/server";

export default async function DemoPage({ params }: { params: Promise<{ locale: "ru" | "en" }> }) {
  setRequestLocale((await params).locale);
  const { t, lang } = await getT();
  const ru = lang === "ru";
  const cta = "/register";
  const tasks = ru ? [
    ["Подготовить заметки к релизу", "Мария", "28 окт"],
    ["Проверить оплату на тестовом стенде", "Игорь", "30 окт"],
    ["Разослать приглашения тестировщикам", "Мария", "1 ноя"],
  ] : [
    ["Prepare release notes", "Maria", "Oct 28"],
    ["Check payments in the test environment", "Igor", "Oct 30"],
    ["Send invitations to beta testers", "Maria", "Nov 1"],
  ];

  return (
    <div className="landing-shell min-h-dvh">
      <SiteHeader />
      <main className="demo-public-page">
        <div className="dashboard-page-heading demo-page-heading">
          <div>
            <p className="hero-eyebrow"><span aria-hidden="true" />{t.demoBadge}</p>
            <h1 className="page-title">{t.demoTitle}</h1>
            <p className="page-subtitle">{t.demoSub}</p>
          </div>
          <Link href="/" className="btn btn-ghost h-10">← {ru ? "На главную" : "Home"}</Link>
        </div>

        <p className="demo-notice" role="note"><span aria-hidden="true">ⓘ</span>{t.demoDisclaimer}</p>

        <article className="meeting-card dashboard-meeting-card card demo-meeting-card p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
            <div>
              <p className="text-sm text-muted">{ru ? "Встреча · 32 минуты" : "Meeting · 32 minutes"}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{ru ? "План запуска беты" : "Beta launch planning"}</h2>
            </div>
            <span className="demo-ready"><i aria-hidden="true" />{t.statusDone}</span>
          </div>

          <section className="demo-summary" aria-labelledby="demo-summary-heading">
            <h3 id="demo-summary-heading"><span className="summary-dot" />{t.summary}</h3>
            <p>{t.demoSummary}</p>
          </section>

          <section className="demo-decisions" aria-labelledby="demo-decisions-heading">
            <h3 id="demo-decisions-heading"><span className="decision-icon" aria-hidden="true">✓</span>{t.decisions}</h3>
            <ul><li>{ru ? "Запустить закрытую бету 3 ноября." : "Launch the private beta on November 3."}</li></ul>
          </section>

          <section className="demo-tasks" aria-labelledby="demo-tasks-heading">
            <div className="demo-section-heading"><h3 id="demo-tasks-heading">{t.tasks}</h3><span>{ru ? "3 задачи" : "3 action items"}</span></div>
            <ul>{tasks.map(([title, owner, date]) => <li key={title}>
              <span className="demo-task-box" aria-hidden="true" />
              <span className="demo-task-title">{title}</span>
              <span className="demo-task-owner">{owner}</span>
              <time className="demo-task-date">{date}</time>
            </li>)}</ul>
          </section>

          <details className="demo-transcript">
            <summary>{t.demoTranscript}</summary>
            <div className="demo-transcript-lines">
              <p><time>00:12</time><span className="spk" data-n="1">{ru ? "Анна" : "Anna"}</span>{ru ? "Зафиксируем запуск закрытой беты на 3 ноября." : "Let's set the private beta launch for November 3."}</p>
              <p><time>00:29</time><span className="spk" data-n="2">{ru ? "Игорь" : "Igor"}</span>{ru ? "Я проверю оплату на тестовом стенде до 30 октября." : "I'll check payments in the test environment by October 30."}</p>
              <p><time>00:41</time><span className="spk" data-n="3">{ru ? "Мария" : "Maria"}</span>{ru ? "Подготовлю заметки к релизу к 28 октября и приглашения к 1 ноября." : "I'll prepare release notes by October 28 and invitations by November 1."}</p>
              <p><time>00:59</time><span className="spk" data-n="1">{ru ? "Анна" : "Anna"}</span>{ru ? "Отлично, фиксируем план." : "Great, let's go with that plan."}</p>
            </div>
          </details>
        </article>

        <div className="demo-next-step">
          <div><h2>{ru ? "Теперь попробуйте на своей встрече" : "Now try it with your own meeting"}</h2><p>{ru ? "Загрузите запись — MoleSkill подготовит такой же структурированный результат для вашей команды." : "Upload a recording and MoleSkill will prepare the same kind of structured result for your team."}</p></div>
          <NextLink href={cta} className="btn btn-primary">{t.register} →</NextLink>
        </div>
      </main>
    </div>
  );
}

import { requireContext } from "@/lib/context";
import { getT } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { DashNav } from "@/components/dash-nav";
import { TzCookie } from "@/components/tz-cookie";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ToastProvider } from "@/components/ui/toast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const { t, lang } = await getT();
  const shared = !ctx.workspace.personal;
  const privacy = shared
    ? (lang === "ru" ? `Записи видны только участникам «${ctx.workspace.name}»` : `Recordings are visible only to members of “${ctx.workspace.name}”`)
    : (lang === "ru" ? "Ваши записи доступны только вам" : "Your recordings are private to you");
  return (
    <ToastProvider><div className="dashboard-shell min-h-dvh" data-app-locale={lang}>
      <TzCookie />
      <SiteHeader variant="app" email={ctx.user.email} />
      <div className="dashboard-frame">
        <aside className="dashboard-sidebar">
          <WorkspaceSwitcher
            items={ctx.memberships.map((m) => m.workspace)} currentId={ctx.workspace.id}
            label={t.wsSwitch} personalLabel={t.wsPersonal} roleLabel={`${t.wsYourRole}: ${t[`role${ctx.role}`].toLowerCase()}`}
          />
          <DashNav label={t.navLabel} items={[
            { href: "/dashboard", label: t.navMeetings, icon: "meetings" },
            { href: "/dashboard/tasks", label: t.navTasks, icon: "tasks" },
            { href: "/dashboard/calendar", label: t.navCalendar, icon: "calendar" },
            { href: "/dashboard/assistant", label: t.navAssistant, icon: "assistant" },
            { href: "/dashboard/ask", label: t.navAsk, icon: "ask" },
            { href: "/dashboard/workspace", label: t.navTeam, icon: "team" },
          ]} />
          <div className="sidebar-privacy"><span className="sidebar-privacy-icon" aria-hidden><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg></span><span>{privacy}</span></div>
        </aside>
        <main className="dashboard-content">{children}</main>
      </div>
    </div></ToastProvider>
  );
}

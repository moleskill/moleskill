import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/context";
import { getT } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { AssistantClient } from "./assistant-client";

export default async function AssistantPage() {
  const ctx = await requireContext();
  const { t, lang } = await getT();
  const meetings = await prisma.meeting.count({ where: { workspaceId: ctx.workspace.id, status: "DONE", transcript: { not: null } } });
  const labels = Object.fromEntries(Object.entries(t).filter(([key]) => key.startsWith("ai")));
  return (
    <>
      <div className="dashboard-page-heading">
        <div>
          <h1 className="page-title">{t.aiName}</h1>
          <p className="page-subtitle">{t.aiSub}</p>
        </div>
      </div>
      <AssistantClient t={labels} lang={lang} hasMeetings={meetings > 0} canAsk={can(ctx.role, "ask")} />
    </>
  );
}

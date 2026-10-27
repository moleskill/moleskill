import { prisma } from "@/lib/prisma";
import { requireContext } from "@/lib/context";
import { getT } from "@/lib/i18n";
import { admin } from "@/lib/supabase/admin";
import { AskForm } from "./ask-form";
import { getUserTz } from "@/lib/today";
import { intlLocale } from "@/lib/locale";
import { formatDateTime } from "@/lib/format-date";
import { displayTitle } from "@/lib/display-title";

export default async function Ask() {
  const ctx = await requireContext();
  const [{ t, lang }, timeZone] = await Promise.all([getT(), getUserTz()]);
  const rows = await prisma.meeting.findMany({
    where: { workspaceId: ctx.workspace.id, status: "DONE", transcript: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, title: true, createdAt: true, recordedAt: true, audioPath: true, audioDeletedAt: true },
  });

  // One batched Storage call for all signed URLs.
  const urls = new Map<string, string>();
  if (rows.some((m) => !m.audioDeletedAt)) {
    try {
      const { data } = await admin().storage.from("meetings").createSignedUrls(rows.filter((m) => !m.audioDeletedAt).map((m) => m.audioPath), 60 * 60);
      for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
    } catch (error) {
      console.error("[ask] Could not sign audio URLs", error);
    }
  }
  const meetings = rows.map((m) => ({ id: m.id, title: displayTitle(m.title, m.recordedAt ?? m.createdAt, lang, timeZone), date: formatDateTime(m.recordedAt ?? m.createdAt, intlLocale(lang), timeZone), audioUrl: urls.get(m.audioPath) ?? null }));

  return (
    <>
      <div className="dashboard-page-heading">
        <div>
          <h1 className="page-title">{t.askTitle}</h1>
        <p className="page-subtitle">{t.askSub}</p>
        </div>
      </div>
      <AskForm t={t} meetings={meetings} />
    </>
  );
}

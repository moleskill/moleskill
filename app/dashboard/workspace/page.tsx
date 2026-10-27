import { requireContext } from "@/lib/context";
import { getT } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { listInvites, listMembers } from "@/lib/workspace-admin";
import { WorkspacePanel } from "./panel";
import { getUserTz } from "@/lib/today";
import { intlLocale } from "@/lib/locale";

export default async function WorkspacePage() {
  const ctx = await requireContext();
  const [{ t, lang }, timeZone] = await Promise.all([getT(), getUserTz()]);
  const personal = ctx.workspace.personal;

  // Members and invitations only exist in team workspaces; invitations are visible to owners and admins only.
  const members = personal ? null : await listMembers(ctx.user.id, ctx.workspace.id);
  const invites = !personal && can(ctx.role, "invites.manage") ? await listInvites(ctx.user.id, ctx.workspace.id) : null;

  return (
    <>
      <div className="dashboard-page-heading">
        <div>
          <h1 className="page-title">{t.wsTitle}</h1>
          <p className="page-subtitle">{t.wsSub}</p>
        </div>
      </div>
      <WorkspacePanel
        t={t}
        locale={intlLocale(lang)}
        timeZone={timeZone}
        workspace={ctx.workspace}
        role={ctx.role}
        members={members?.ok ? members.value : []}
        invites={invites && invites.ok ? invites.value : []}
      />
    </>
  );
}

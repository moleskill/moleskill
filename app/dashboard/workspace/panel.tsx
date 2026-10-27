"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  changeRoleAction, createInviteAction, createWorkspaceAction, deleteWorkspaceAction, removeMemberAction, renameWorkspaceAction, revokeInviteAction,
} from "@/app/actions/workspace";
import { can, canChangeRole, canInviteRole, ROLES, type Role } from "@/lib/permissions";
import type { InviteView, MemberView } from "@/lib/workspace-admin";
import { formatDate } from "@/lib/format-date";

type T = Record<string, string>;
type Outcome = { ok: true } | { ok: false; error: string };

const errorText = (t: T, outcome: { ok: false; error: string }) => t[`wsErr_${outcome.error}`] ?? t.wsErr_generic;

function Card({ title, hint, children, tone }: { title: string; hint?: string; children: ReactNode; tone?: "danger" }) {
  return (
    <section className="app-panel ws-card">
      <h2 className={tone === "danger" ? "text-danger" : ""}>{title}</h2>
      {hint && <p className="ws-hint">{hint}</p>}
      {children}
    </section>
  );
}

function Notice({ error, saved }: { error: string; saved?: string }) {
  if (error) return <p role="alert" className="mt-3 text-sm text-danger">{error}</p>;
  return saved ? <p role="status" className="mt-3 text-sm text-ok">{saved}</p> : null;
}

export function WorkspacePanel({ t, workspace, role, members, invites, locale, timeZone }: {
  t: T; workspace: { id: string; name: string; personal: boolean }; role: Role; members: MemberView[]; invites: InviteView[]; locale: string; timeZone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // ---- workspace-level actions
  const [name, setName] = useState(workspace.name);
  const [nameMsg, setNameMsg] = useState({ error: "", saved: "" });
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [dangerError, setDangerError] = useState("");

  // ---- members and invitations
  const [memberError, setMemberError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const inviteRoles = ROLES.filter((r) => canInviteRole(role, r));
  const [inviteRole, setInviteRole] = useState<Role>(inviteRoles.includes("MEMBER") ? "MEMBER" : (inviteRoles[0] ?? "VIEWER"));
  const [inviteError, setInviteError] = useState("");
  const [fresh, setFresh] = useState<{ url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const run = (job: () => Promise<Outcome>, onError: (message: string) => void, onOk?: () => void) =>
    start(async () => {
      const outcome = await job();
      if (outcome.ok) { onError(""); onOk?.(); router.refresh(); } else onError(errorText(t, outcome));
    });

  const canRename = !workspace.personal && can(role, "workspace.rename");
  const canInvite = !workspace.personal && can(role, "invites.manage");
  const fmtDate = (iso: string) => formatDate(new Date(iso), locale, timeZone, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="ws-grid">
      <Card title={workspace.personal ? t.wsPersonal : workspace.name} hint={workspace.personal ? t.wsPersonalNote : t["roleDesc" + role]}>
        {!workspace.personal && <p className="ws-role-line"><span className="ws-badge">{t["role" + role]}</span></p>}
        {canRename && (
          <form className="ws-row mt-4" onSubmit={(e) => { e.preventDefault(); run(() => renameWorkspaceAction(workspace.id, name), (error) => setNameMsg({ error, saved: "" }), () => setNameMsg({ error: "", saved: t.wsSaved })); }}>
            <label className="sr-only" htmlFor="ws-name">{t.wsName}</label>
            <input id="ws-name" className="input min-w-0 flex-1" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setNameMsg({ error: "", saved: "" }); }} />
            <button className="btn btn-primary" disabled={pending || !name.trim() || name.trim() === workspace.name}>{t.wsSave}</button>
          </form>
        )}
        <Notice error={nameMsg.error} saved={nameMsg.saved} />
      </Card>

      {!workspace.personal && (
        <Card title={`${t.wsMembers} · ${members.length}`}>
          <ul className="ws-list">
            {members.map((m) => {
              const options = ROLES.filter((r) => r === m.role || canChangeRole(role, m.role, r));
              const editable = !m.you && options.length > 1;
              const removable = !m.you && canChangeRole(role, m.role, null);
              return (
                <li key={m.userId} className="ws-member">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.email ?? m.userId.slice(0, 8)}{m.you && <span className="ml-2 text-sm font-normal text-muted">{t.wsYou}</span>}</p>
                  </div>
                  {editable ? (
                    <select className="input h-9 w-auto text-sm" value={m.role} disabled={pending} aria-label={t.wsInviteRole}
                      onChange={(e) => run(() => changeRoleAction(workspace.id, m.userId, e.target.value), setMemberError)}>
                      {options.map((r) => <option key={r} value={r}>{t["role" + r]}</option>)}
                    </select>
                  ) : <span className="ws-badge">{t["role" + m.role]}</span>}
                  {removable && (
                    <button type="button" className="ws-link-danger" disabled={pending}
                      onClick={() => { if (confirm(t.wsRemoveConfirm)) run(() => removeMemberAction(workspace.id, m.userId), setMemberError); }}>{t.wsRemove}</button>
                  )}
                  {m.you && (
                    <button type="button" className="ws-link-danger" disabled={pending}
                      onClick={() => { if (confirm(t.wsLeaveConfirm)) run(() => removeMemberAction(workspace.id, m.userId), setMemberError, () => router.push("/dashboard")); }}>{t.wsLeave}</button>
                  )}
                </li>
              );
            })}
          </ul>
          <Notice error={memberError} />
          <dl className="ws-roles">
            {ROLES.map((r) => <div key={r}><dt>{t["role" + r]}</dt><dd>{t["roleDesc" + r]}</dd></div>)}
          </dl>
        </Card>
      )}

      {canInvite && (
        <Card title={t.wsInvites} hint={t.wsInviteHint}>
          <form className="ws-invite-form" onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createInviteAction(workspace.id, inviteRole, inviteEmail);
              if (!r.ok) { setInviteError(errorText(t, r)); return; }
              setInviteError(""); setInviteEmail(""); setCopied(false);
              setFresh({ url: `${window.location.origin}/invite/${r.token}` });
              router.refresh();
            });
          }}>
            <label className="ws-field">{t.wsInviteEmail}
              <input className="input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} autoComplete="off" />
            </label>
            <label className="ws-field">{t.wsInviteRole}
              <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                {inviteRoles.map((r) => <option key={r} value={r}>{t["role" + r]}</option>)}
              </select>
            </label>
            <button className="btn btn-primary" disabled={pending}>{t.wsInviteCreate}</button>
          </form>
          <p className="ws-hint mt-2">{t.wsInviteEmailHint}</p>
          <Notice error={inviteError} />

          {fresh && (
            <div className="ws-link-box">
              <p>{t.wsInviteLink}<span className="block text-sm text-muted">{t.wsInviteEmailHint}</span></p>
              <div className="ws-row">
                <input className="input min-w-0 flex-1 text-sm" readOnly value={fresh.url} onFocus={(e) => e.currentTarget.select()} aria-label={t.wsInviteLink} />
                <button type="button" className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(fresh.url); setCopied(true); }}>{copied ? t.wsInviteCopied : t.wsInviteCopy}</button>
              </div>
            </div>
          )}

          <h3 className="ws-sub">{t.wsPending}</h3>
          {invites.length === 0 ? <p className="ws-hint">{t.wsNoInvites}</p> : (
            <ul className="ws-list">
              {invites.map((i) => (
                <li key={i.id} className="ws-member">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{i.email ?? t.wsAnyone}</p>
                    <p className="text-sm text-muted">{fmtDate(i.expiresAt)}</p>
                  </div>
                  <span className="ws-badge">{t["role" + i.role]}</span>
                  <button type="button" className="ws-link-danger" disabled={pending} onClick={() => run(() => revokeInviteAction(workspace.id, i.id), setInviteError)}>{t.wsRevoke}</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title={t.wsCreateTitle} hint={t.wsCreateHint}>
        <form className="ws-row mt-4" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createWorkspaceAction(newName);
            if (!r.ok) { setCreateError(errorText(t, r)); return; }
            setCreateError(""); setNewName(""); router.refresh();
          });
        }}>
          <label className="sr-only" htmlFor="ws-new">{t.wsCreateName}</label>
          <input id="ws-new" className="input min-w-0 flex-1" placeholder={t.wsCreateName} value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn btn-primary" disabled={pending || !newName.trim()}>{t.wsCreate}</button>
        </form>
        <Notice error={createError} />
      </Card>

      {!workspace.personal && can(role, "workspace.delete") && (
        <Card title={t.wsDangerTitle} tone="danger">
          <button type="button" className="btn btn-ghost mt-3 text-danger" disabled={pending}
            onClick={() => { if (confirm(t.wsDeleteConfirm)) run(() => deleteWorkspaceAction(workspace.id), setDangerError, () => router.push("/dashboard")); }}>{t.wsDelete}</button>
          <Notice error={dangerError} />
        </Card>
      )}
    </div>
  );
}

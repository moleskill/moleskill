import Link from "next/link";
import { getT } from "@/lib/i18n";
import { getUser } from "@/lib/auth";
import { previewInvite } from "@/lib/workspace-admin";
import { withNext } from "@/lib/next-url";
import { AcceptInvite } from "./accept";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ t }, user, preview] = await Promise.all([getT(), getUser(), previewInvite(token)]);
  const here = `/invite/${token}`;

  const notice = (text: string) => <p role="alert" className="text-muted">{text}</p>;
  let body: React.ReactNode;
  if (!preview) body = notice(t.invInvalid);
  else if (preview.state === "used") body = notice(t.invUsed);
  else if (preview.state === "expired") body = notice(t.invExpired);
  else {
    const mismatch = !!user && !!preview.email && preview.email !== user.email?.toLowerCase();
    body = (
      <>
        <h1 className="text-2xl font-semibold tracking-[-.03em]">{t.invTitle.replace("{name}", preview.workspaceName)}</h1>
        <p className="mt-2 text-muted">{t.invBody.replace("{role}", t[`role${preview.role}`].toLowerCase())}</p>
        <p className="mt-1 text-sm text-muted">{t[`roleDesc${preview.role}`]}</p>
        {preview.email && <p className="mt-3 text-sm text-muted">{t.invForEmail.replace("{email}", preview.email)}</p>}
        <div className="mt-7">
          {mismatch ? <p role="alert" className="text-sm text-danger">{t.invMismatch}</p>
            : user ? <AcceptInvite token={token} label={t.invAccept} errors={{ invite_invalid: t.invInvalid, invite_used: t.invUsed, invite_expired: t.invExpired, invite_email_mismatch: t.invMismatch, limit_reached: t.wsErr_limit_reached, unauthorized: t.invSignIn, generic: t.wsErr_generic }} />
            : (
              <div className="flex flex-col gap-3">
                <Link href={withNext("/login", here)} className="btn btn-primary btn-lg w-full">{t.invSignIn}</Link>
                <Link href={withNext("/register", here)} className="btn btn-ghost btn-lg w-full">{t.invRegister}</Link>
              </div>
            )}
        </div>
      </>
    );
  }
  return (
    <>
      {body}
      {user && (!preview || preview.state !== "valid") && <Link href="/dashboard" className="btn btn-ghost mt-6 w-full">{t.invOpenApp}</Link>}
    </>
  );
}

"use client";
import { useState, useTransition } from "react";
import { acceptInviteAction } from "@/app/actions/workspace";

export function AcceptInvite({ token, label, errors }: { token: string; label: string; errors: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button" disabled={pending} className="btn btn-primary btn-lg w-full"
        // On success the action redirects to the app; it only returns when something went wrong.
        onClick={() => start(async () => { const result = await acceptInviteAction(token); if (result?.error) setError(errors[result.error] ?? errors.generic); })}
      >{label}</button>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </>
  );
}

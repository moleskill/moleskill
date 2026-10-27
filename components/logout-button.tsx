"use client";

import { useState } from "react";

export function LogoutButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); } finally { window.location.assign("/"); }
  }
  return <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void logout()}>{label}</button>;
}

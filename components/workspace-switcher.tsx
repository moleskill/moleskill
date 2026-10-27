"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchWorkspace } from "@/app/actions/workspace";

type Item = { id: string; name: string; personal: boolean };

/** Chooses which workspace the whole app shows. A native select keeps it accessible and works the same on phones. */
export function WorkspaceSwitcher({ items, currentId, label, personalLabel, roleLabel }: { items: Item[]; currentId: string; label: string; personalLabel: string; roleLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="ws-switcher">
      <label htmlFor="ws-select" className="ws-switcher-label">{label}</label>
      <div className="ws-switcher-box">
        <select
          id="ws-select" className="ws-select" value={currentId} disabled={pending}
          onChange={(e) => start(async () => { await switchWorkspace(e.target.value); router.refresh(); })}
        >
          {items.map((w) => <option key={w.id} value={w.id}>{w.personal ? personalLabel : w.name}</option>)}
        </select>
        <svg className="ws-select-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg>
      </div>
      <p className="ws-switcher-role">{roleLabel}</p>
    </div>
  );
}

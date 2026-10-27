"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Icon = "meetings" | "tasks" | "calendar" | "team" | "ask" | "assistant";
type Item = { href: string; label: string; icon: Icon };

const PATHS: Record<Icon, React.ReactNode> = {
  meetings: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" /></>,
  tasks: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="m8 12.2 2.8 2.8L16 9.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="4" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  team: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6" /><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.6c1.8.5 2.9 2 3.2 4.4" /></>,
  assistant: <><path d="M12 3.2l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z" /><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
  ask: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z" /><path d="M9.5 10a2.5 2.5 0 0 1 5 .3c0 1.6-2.5 2-2.5 3.7M12 16.8v.2" /></>,
};

export function DashNav({ items, label }: { items: Item[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1 lg:block lg:space-y-0.5 lg:border-0 lg:bg-transparent lg:p-0">
      {items.map((i) => {
        const active = i.href === "/dashboard" ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`nav-link shrink-0 ${active ? "nav-link-active" : ""}`}>
            <span className={`hidden size-5 items-center justify-center lg:flex ${active ? "text-accent" : ""}`} aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PATHS[i.icon]}</svg>
            </span>
            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

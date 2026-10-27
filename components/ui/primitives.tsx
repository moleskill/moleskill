import Link from "next/link";
import { dateLeafParts } from "@/lib/format-date";

export function Chip({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <span className={`inline-flex min-h-7 items-center rounded-full border border-line px-2.5 text-xs text-muted ${className}`}>{children}</span>; }
export function Skeleton({ className = "" }: { className?: string }) { return <span aria-hidden="true" className={`block animate-pulse rounded-lg bg-fg/10 ${className}`} />; }
export function Kbd({ children }: { children: React.ReactNode }) { return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">{children}</kbd>; }

export function DateLeaf({ date, href, size = "md", locale = "ru-RU", timeZone }: { date: Date; href?: string; size?: "sm" | "md" | "lg"; locale?: string; timeZone?: string }) {
  const { month, weekday, day } = dateLeafParts(date, locale, timeZone ?? "UTC");
  const body = <span className={`date-leaf date-leaf-${size} inline-flex items-baseline gap-1.5`}><span className="date-leaf-spine">{month}</span><strong>{day}</strong><span>{weekday}</span></span>;
  return href ? <Link href={href} className="inline-flex rounded-lg focus-visible:outline">{body}</Link> : body;
}

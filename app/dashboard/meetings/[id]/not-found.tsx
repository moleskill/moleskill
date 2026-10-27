import Link from "next/link";
import { getT } from "@/lib/i18n";
export default async function MeetingNotFound() { const { t } = await getT(); return <section className="mx-auto max-w-xl rounded-2xl border border-line p-6"><h1 className="font-serif text-2xl">{t.mdNotFound}</h1><Link className="btn btn-primary mt-4 min-h-11" href="/dashboard">{t.mdBack}</Link></section>; }

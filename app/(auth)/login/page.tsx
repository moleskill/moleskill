import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/next-url";
import { googleConfigured } from "@/lib/google-oauth";
import { CustomAuthForm } from "@/components/custom-auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string }> }) {
  const { redirect_url } = await searchParams;
  const { t, lang } = await getT();
  if (!process.env.AUTH_SECRET) return <><h1 className="auth-fallback-title">{t.loginTitle}</h1><p role="status" className="text-sm leading-6 text-muted">AUTH_SECRET is not set. Add a random string of 32+ characters to .env.</p></>;
  if (await getUser()) redirect(safeNext(redirect_url) ?? "/dashboard");
  return <Suspense><CustomAuthForm mode="login" lang={lang} termsText={t.termsPrefix} termsUrl="/terms" googleEnabled={googleConfigured()} /></Suspense>;
}

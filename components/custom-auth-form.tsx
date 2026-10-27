"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";

type Language = "ru" | "en";
type Props = { mode: "login" | "register"; lang: Language; termsText: string; termsUrl: string; googleEnabled: boolean };
type Stage = "credentials" | "verify-signup" | "forgot-email" | "forgot-reset";

const copy = {
  ru: {
    email: "Электронная почта", password: "Пароль", newPassword: "Новый пароль", code: "Код из письма (6 цифр)",
    submitLogin: "Войти", submitRegister: "Создать аккаунт", verify: "Подтвердить почту", sendCode: "Отправить код", reset: "Сменить пароль",
    resend: "Отправить код ещё раз", resendIn: "Отправить ещё раз через", codeSent: "Мы отправили код на", terms: "условия использования",
    noAccount: "Нет аккаунта?", haveAccount: "Уже есть аккаунт?", register: "Зарегистрироваться", login: "Войти",
    forgot: "Забыли пароль?", resetTitle: "Восстановление пароля", back: "Назад ко входу", wait: "Подождите…", or: "или",
    google: "Продолжить с Google", welcome: "С возвращением", create: "Создайте аккаунт", hint: "Продолжите работу в своём пространстве MoleSkill.",
    passwordHint: "Не меньше 8 символов.", loading: "Загрузка",
    errors: {
      invalid_email: "Введите корректный адрес электронной почты.", password_short: "Пароль должен быть не короче 8 символов.",
      password_long: "Пароль слишком длинный (максимум 128 символов).", password_weak: "Выберите пароль посложнее.",
      terms_required: "Подтвердите согласие с условиями.", invalid_credentials: "Неверная почта или пароль.",
      invalid_code: "Неверный код.", expired_code: "Код устарел. Запросите новый.", too_many_attempts: "Слишком много попыток. Запросите новый код.",
      rate_limited: "Слишком много запросов. Попробуйте чуть позже.", email_failed: "Не удалось отправить письмо. Попробуйте ещё раз.",
      forbidden_origin: "Запрос отклонён. Обновите страницу.", google_failed: "Не удалось войти через Google. Попробуйте ещё раз.",
      google_unavailable: "Вход через Google пока не настроен.", terms: "Чтобы создать аккаунт, примите условия использования.",
      generic: "Что-то пошло не так. Проверьте данные и попробуйте ещё раз.",
    },
  },
  en: {
    email: "Email address", password: "Password", newPassword: "New password", code: "Email code (6 digits)",
    submitLogin: "Sign in", submitRegister: "Create account", verify: "Verify email", sendCode: "Send code", reset: "Change password",
    resend: "Send code again", resendIn: "Send again in", codeSent: "We sent a code to", terms: "Terms of Use",
    noAccount: "Don't have an account?", haveAccount: "Already have an account?", register: "Sign up", login: "Sign in",
    forgot: "Forgot password?", resetTitle: "Reset your password", back: "Back to sign in", wait: "Please wait…", or: "or",
    google: "Continue with Google", welcome: "Welcome back", create: "Create your account", hint: "Continue to your MoleSkill workspace.",
    passwordHint: "At least 8 characters.", loading: "Loading",
    errors: {
      invalid_email: "Enter a valid email address.", password_short: "The password must be at least 8 characters.",
      password_long: "The password is too long (128 characters at most).", password_weak: "Choose a stronger password.",
      terms_required: "Accept the Terms of Use to continue.", invalid_credentials: "Wrong email or password.",
      invalid_code: "That code is not right.", expired_code: "The code has expired. Request a new one.", too_many_attempts: "Too many attempts. Request a new code.",
      rate_limited: "Too many requests. Try again in a little while.", email_failed: "We could not send the email. Please try again.",
      forbidden_origin: "Request rejected. Refresh the page.", google_failed: "Google sign-in failed. Please try again.",
      google_unavailable: "Google sign-in is not set up yet.", terms: "Accept the Terms of Use to create an account.",
      generic: "Something went wrong. Check your details and try again.",
    },
  },
} as const;

function GoogleMark() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4 1.9-6.8 1.9-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z"/><path fill="#4CAF50" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18l6.9-5.2Z"/><path fill="#1976D2" d="M24 12c3 0 5.7 1 7.8 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.9 15l6.9 5.2C14.4 15.5 18.8 12 24 12Z"/></svg>;
}

/** Only a path on this site is accepted, so a crafted link cannot send people elsewhere after signing in. */
function safeReturnTo(value: string | null, fallback: string) {
  if (!value) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}

async function call(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = (await response.json().catch(() => ({}))) as { error?: string; next?: string };
  return { ok: response.ok, status: response.status, data };
}

export function CustomAuthForm({ mode, lang, termsText, termsUrl, googleEnabled }: Props) {
  const searchParams = useSearchParams();
  const text = copy[lang];
  const returnTo = searchParams.get("redirect_url");
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const fromGoogle = searchParams.get("error");
    if (fromGoogle && fromGoogle in text.errors) setError(text.errors[fromGoogle as keyof typeof text.errors]);
  }, [searchParams, text]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const fail = (key?: string) => setError(text.errors[(key ?? "generic") as keyof typeof text.errors] ?? text.errors.generic);
  const done = () => window.location.assign(safeReturnTo(returnTo, "/dashboard")); // a full load, so the server sees the new cookie

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (busy) return;
    if (mode === "register" && stage === "credentials" && !accepted) return fail("terms_required");
    setBusy(true);
    try {
      let result;
      if (stage === "credentials") {
        result = await call(mode, mode === "register" ? { email, password, lang, termsAccepted: accepted } : { email, password, lang });
        if (result.ok && result.data.next === "verify") { setStage("verify-signup"); setCode(""); setCooldown(60); return; }
      } else if (stage === "verify-signup") result = await call("verify", { email, code });
      else if (stage === "forgot-email") {
        result = await call("forgot", { email, lang });
        if (result.ok) { setStage("forgot-reset"); setCode(""); setPassword(""); setCooldown(60); return; }
      } else result = await call("reset", { email, code, password });

      if (result.ok) done();
      else fail(result.data.error);
    } catch { fail(); } finally { setBusy(false); }
  }

  async function resend() {
    if (busy || cooldown > 0) return;
    setBusy(true); setError("");
    try {
      await call(stage === "forgot-reset" ? "forgot" : "resend", { email, lang });
      setCooldown(60);
    } catch { fail(); } finally { setBusy(false); }
  }

  const verification = stage === "verify-signup" || stage === "forgot-reset";
  const isForgot = stage.startsWith("forgot-");
  const title = stage === "verify-signup" ? text.verify : isForgot ? text.resetTitle : mode === "login" ? text.welcome : text.create;
  const showEmail = stage === "credentials" || stage === "forgot-email";
  const showPassword = stage === "credentials" || stage === "forgot-reset";
  const submitLabel = busy ? text.wait : stage === "credentials" ? (mode === "login" ? text.submitLogin : text.submitRegister)
    : stage === "verify-signup" ? text.verify : stage === "forgot-email" ? text.sendCode : text.reset;
  const googleHref = `/api/auth/google?mode=${mode}&terms=${accepted ? 1 : 0}&lang=${lang}${returnTo ? `&next=${encodeURIComponent(returnTo)}` : ""}`;

  return (
    <div className="custom-auth">
      <p className="custom-auth-eyebrow">MOLESKILL</p>
      <h2 className="custom-auth-title">{title}</h2>
      <p className="custom-auth-subtitle">{verification ? `${text.codeSent} ${email}` : isForgot ? text.resetTitle : text.hint}</p>
      <form className="custom-auth-form" onSubmit={submit}>
        {showEmail && <label className="custom-auth-field"><span>{text.email}</span><input className="input" type="email" name="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
        {verification && <label className="custom-auth-field"><span>{text.code}</span><input className="input" type="text" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 \-]*" maxLength={9} required autoFocus value={code} onChange={(event) => setCode(event.target.value)} /></label>}
        {showPassword && <label className="custom-auth-field"><span>{stage === "forgot-reset" ? text.newPassword : text.password}</span><input className="input" type="password" name="password" autoComplete={stage === "credentials" && mode === "login" ? "current-password" : "new-password"} required minLength={stage === "credentials" && mode === "login" ? undefined : 8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />{(mode === "register" || stage === "forgot-reset") && <small className="text-xs text-muted">{text.passwordHint}</small>}</label>}
        {mode === "register" && stage === "credentials" && <label className="custom-auth-terms"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>{termsText}<a href={termsUrl}>{text.terms}</a></span></label>}
        {error && <p className="custom-auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary custom-auth-submit" type="submit" disabled={busy}>{submitLabel}</button>
      </form>
      {stage === "credentials" && googleEnabled && <><div className="custom-auth-divider"><span>{text.or}</span></div><button type="button" className="custom-auth-google" onClick={() => { if (mode === "register" && !accepted) return fail("terms_required"); window.location.assign(googleHref); }} disabled={busy}><GoogleMark />{text.google}</button></>}
      {verification && <button type="button" className="custom-auth-text-button" onClick={() => void resend()} disabled={busy || cooldown > 0}>{cooldown > 0 ? `${text.resendIn} ${cooldown}` : text.resend}</button>}
      {mode === "login" && stage === "credentials" && <button type="button" className="custom-auth-text-button" onClick={() => { setError(""); setStage("forgot-email"); }}>{text.forgot}</button>}
      {stage !== "credentials" && <button type="button" className="custom-auth-back" onClick={() => { setStage("credentials"); setCode(""); setPassword(""); setError(""); }}>{text.back}</button>}
      {stage === "credentials" && <p className="custom-auth-switch">{mode === "login" ? text.noAccount : text.haveAccount}<a href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? text.register : text.login}</a></p>}
    </div>
  );
}

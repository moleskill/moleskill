import "server-only";

export type CodePurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

const copy = {
  ru: {
    VERIFY_EMAIL: { subject: "Код подтверждения MoleSkill", title: "Подтвердите почту", lead: "Введите этот код на странице регистрации:" },
    RESET_PASSWORD: { subject: "Сброс пароля MoleSkill", title: "Сброс пароля", lead: "Введите этот код, чтобы задать новый пароль:" },
    expires: "Код действует 10 минут.", ignore: "Если вы не запрашивали код, просто проигнорируйте это письмо: ваш аккаунт в безопасности.",
  },
  en: {
    VERIFY_EMAIL: { subject: "Your MoleSkill verification code", title: "Confirm your email", lead: "Enter this code on the sign-up page:" },
    RESET_PASSWORD: { subject: "Reset your MoleSkill password", title: "Reset your password", lead: "Enter this code to choose a new password:" },
    expires: "The code is valid for 10 minutes.", ignore: "If you did not request this, you can ignore this email: your account is safe.",
  },
} as const;

export function renderCodeEmail(code: string, purpose: CodePurpose, lang: "ru" | "en") {
  const t = copy[lang], p = t[purpose];
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#18181b">
<p style="font-size:12px;letter-spacing:.14em;color:#71717a;margin:0 0 12px">MOLESKILL</p>
<h1 style="font-size:20px;margin:0 0 8px">${p.title}</h1>
<p style="margin:0 0 16px;color:#3f3f46">${p.lead}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:.3em;margin:0 0 16px;font-family:ui-monospace,Menlo,Consolas,monospace">${code}</p>
<p style="margin:0 0 6px;color:#3f3f46">${t.expires}</p>
<p style="margin:0;font-size:13px;color:#71717a">${t.ignore}</p></div>`;
  return { subject: `${p.subject}: ${code}`, html, text: `${p.title}\n\n${p.lead} ${code}\n\n${t.expires}\n${t.ignore}` };
}

/** Sends through Brevo's transactional API. Without a key it only logs the code, and only outside production. */
export async function sendCodeEmail(input: { to: string; code: string; purpose: CodePurpose; lang: "ru" | "en" }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("BREVO_NOT_CONFIGURED");
    console.info(`[mailer] BREVO_API_KEY is not set; ${input.purpose} code for ${input.to}: ${input.code}`);
    return;
  }
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL_MISSING");
  const mail = renderCodeEmail(input.code, input.purpose, input.lang);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "MoleSkill", email: senderEmail },
      to: [{ email: input.to }],
      subject: mail.subject, htmlContent: mail.html, textContent: mail.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`BREVO_${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
}

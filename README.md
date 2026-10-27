# MoleSkill Web

MoleSkill turns meeting recordings into speaker-labelled transcripts, summaries, decisions, action items and searchable notes.

**Stack:** Next.js 16 App Router · React 19 · own auth (Brevo email codes, Google) · Prisma ORM 7 + Supabase Postgres · Supabase Storage · Deepgram Nova-3 (speech recognition) · Groq (LLM only) · next-intl · Tailwind CSS 4.

## Requirements

- Node.js 20.9+ (22 LTS recommended) and pnpm 10+
- Supabase project with Postgres and Storage
- Brevo account (transactional email) and, optionally, a Google OAuth client
- Deepgram API key for audio transcription
- Groq API key for summaries, questions and translation

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env
# Fill DATABASE_URL and DIRECT_URL first; add provider keys when available.
pnpm exec prisma migrate deploy
pnpm exec prisma db execute --file supabase/setup.sql
pnpm dev
```

`prisma/schema.prisma` is the only source for application tables. `supabase/setup.sql` contains only the private `meetings` Storage bucket and RLS setup. The setup script can be safely rerun. Apply Prisma migrations before the Supabase-specific SQL.

Brevo, Google, Deepgram, Groq and Supabase keys are required only for their live features. Without provider keys, the app shows clear setup errors; unit tests and static compilation do not call the providers.

## Environment variables

| Variable | Purpose / source |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler connection string for the app runtime |
| `DIRECT_URL` | Supabase direct or session-pooler connection string for Prisma migrations |
| `AUTH_SECRET` | Random string, 32+ characters; keys the email-code hashes. Server only |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Brevo API key and a verified sender; used to email 6-digit codes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth client; redirect URI is `NEXT_PUBLIC_SITE_URL/api/auth/google/callback` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and public anon/publishable key, used by signed Storage uploads |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key; server only |
| `DEEPGRAM_API_KEY` | Deepgram Console API key; required for speech recognition |
| `DEEPGRAM_MODEL` | Deepgram model; defaults to `nova-3` |
| `DEEPGRAM_LANGUAGE` | `multi` for mixed Russian/English, or a language such as `ru` |
| `DEEPGRAM_TIMEOUT_MS` | Request timeout; defaults to 600000 |
| `GROQ_API_KEY` | Groq Console API key; used only for LLM tasks |
| `GROQ_LLM_MODEL` | LLM model; defaults to `openai/gpt-oss-120b` |
| `CRON_SECRET` | Optional secret for `/api/cron/maintenance`; generate with `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | Public origin used for invitation links |
| `NEXT_PUBLIC_YOUTUBE_URL`, `NEXT_PUBLIC_DONATION_URL` | Optional public support links |
| `DELETE_AUDIO_DEFAULT` | `true` deletes audio when analysis finishes; defaults to `false` |

All local configuration is read from `.env`. Do not put secrets in `NEXT_PUBLIC_` variables unless they are explicitly public.

## Authentication and invitations

Authentication is built into the app, with no third-party auth service:

- **Email + password.** Sign-up creates an unverified account and emails a 6-digit code through Brevo; the account works once the code is entered. Passwords are hashed with scrypt.
- **Google.** OAuth 2.0 authorization-code flow with PKCE. A Google address is already verified, so Google sign-in needs no email code. If the address already has an account it is linked.
- **Password reset.** "Forgot password" emails a 6-digit code; resetting signs out every other device.
- **Codes.** Valid for 10 minutes, single use, at most 5 wrong guesses, 60 s between resends. Only an HMAC (keyed with `AUTH_SECRET`) is stored.
- **Sessions.** A random 256-bit token in an httpOnly, SameSite=Lax cookie (`ms_session`, 30 days); only its SHA-256 is stored in `sessions`. Rate limits apply per IP and per address, and cookie-authenticated API writes must come from the site's own origin.

Internal foreign keys are UUIDs (`public.users.id`). Sign-up records the Terms of Use version (`2026-10-23`). Workspace invitations are single-use links that expire after seven days. An optional email on an invitation restricts acceptance to that verified address; invitations are not emailed.

For Android/Windows, send `POST /api/auth/login` with the header `X-Client: native`; the response then also contains `token`, which is sent as `Authorization: Bearer <token>` with each API request. See [docs/api.md](docs/api.md).

## MoleSkill AI (voice assistant)

`/dashboard/assistant` is a hands-free assistant. Tap the microphone and speak; it stops listening by itself after a pause, turns the clip into text with Deepgram, works out what you want, and reads the answer aloud (browser speech synthesis; the speaker button turns it off). A text box is there for quiet places.

- **Meetings:** questions about what was said or decided are answered from the workspace's transcripts, with links to the exact moments (the same engine as the Ask page).
- **Tasks:** "what are my tasks this week", "what is overdue", "Anna's tasks". The answer is built from the database, not by the model, so task text from recordings never goes back into a prompt.
- **Follow-ups:** it remembers your last three questions, so "and what did Anna say?" works.
- It is read-only (it changes nothing), limited to 8 requests a minute and 120 a day per person, and the voice clip is not stored. It uses the existing `DEEPGRAM_API_KEY` and `GROQ_API_KEY`; no new settings.
- API: `POST /api/assistant` (see [docs/api.md](docs/api.md)).

## Speech processing

Audio is submitted once to Deepgram's pre-recorded `/v1/listen` endpoint using Nova-3 multilingual by default, diarization, utterances and smart formatting. Utterances provide timestamps and speaker IDs; IDs are normalized to `{s1}`, `{s2}` in the transcript and stored in `transcript_segments.speaker`. The labels appear in transcript exports and are included when Groq analyzes the transcript. Groq is used only for summaries, decisions, questions, tasks and translation. Temporary network errors, 429s and 5xx responses are retried; invalid audio and no-speech results have distinct errors.

Processing keeps the configured `MAX_ATTEMPTS`, stale-processing recovery and the per-user concurrency limit. Long transcripts are split for LLM analysis without dropping content.

## Languages and performance

Public content is routed at `/ru` and `/en` using next-intl, with Russian as the default and `Accept-Language` negotiation for guests. Signed-in users store their preferred language in `users.lang`; the language selector updates that profile. 
## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Deploy setup

1. Add the variables listed above to `.env` locally and to the hosting provider.
2. Brevo: create an API key and verify the sender address (or domain) you will send from; put them in `BREVO_*`. Without `BREVO_API_KEY`, codes are only printed to the server console, and only outside production.
3. Optional Google sign-in: create a Web OAuth client and add `https://YOUR_DOMAIN/api/auth/google/callback` (and `http://localhost:3000/api/auth/google/callback` for local work) as an authorized redirect URI.
4. Run `pnpm exec prisma migrate deploy`, then apply `supabase/setup.sql` (it also enables RLS on the new `sessions` and `auth_codes` tables) using the database connection or Supabase SQL Editor.
5. Configure `CRON_SECRET` and call `/api/cron/maintenance` periodically if automatic recovery of stale recordings is desired.

# MoleSkill UX/UI plan

## Scope and sequence

1. **Foundation:** add accessible toast and sheet primitives, motion tokens, a compact mobile navigation, and a command palette without runtime dependencies. Preserve the workspace navigation and role checks.
2. **Recorder:** separate capture, review, upload, and processing states; make cancel/retry/review explicit, persist only recoverable in-progress drafts, show audio level and duration/size limits.
3. **Meeting detail:** add an access-scoped server-rendered meeting route with date leaf, playback/transcript/notes/meeting-scoped Q&A, loading/error/not-found states, and fresh signed audio URLs.
4. **List and calendar:** move list entries to detail links, group by the user's time zone, paginate, and combine recordings with tasks in calendar views.
5. **Presentation:** add safe demo data tooling and a reusable read-only demo view, then improve the landing animation and provide a presentation script.

## Data changes

Add nullable `recordedAt`, `durationSec`, `language`, `speakerNames`, and `processingStage` to `Meeting` in a new additive migration. Existing rows remain valid. Migration SQL will be supplied if the database is unavailable; never edit the init migration.

## Risks and guardrails

- Keep all meeting and task reads scoped to `workspaceId`; use `can()` for mutations and return 404 for out-of-workspace detail IDs.
- Preserve API response compatibility and Bearer-token behavior. Validate all client-supplied recording metadata.
- Treat task due dates as UTC calendar dates and meeting timestamps as instants rendered in the user's `tz` cookie zone.
- No new runtime dependencies. Do not expose signed URLs or transcript content in logs. Keep audio processing lazy and motion reduced when requested.
- Run typecheck, lint, tests, and webpack build at each phase boundary when the local dependency store permits.

## Baseline

`pnpm typecheck` passed and `pnpm test` passed (11 files, 35 tests). `pnpm install` could not open the configured pnpm store operation lock because it is read-only; current installed dependencies are usable. Database connectivity and visual browser checks remain to be established.

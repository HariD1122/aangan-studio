# Aangan Studio – Architecture, Schema, Integration Checklist, Phase 1 Plan

## 1. Architecture (simple English)
- **Next.js (App Router, TypeScript) on Vercel**: pages AND server API routes live in one repo.
- **Neon Postgres** (replaced Supabase): the database. Login is built into the app (password + secure session cookie). Row Level Security (RLS) is the real lock on the data: each request runs as a restricted database role with the signed-in user's ID set.
- **Server-only code** (`src/server/*`) holds secrets: database URL, HubSpot token, Gemini key, VaaniVoice key. These never reach the browser.
- **Gemini = "thinking layer"**: server-side only. It reads a call transcript/summary and returns *suggested* structured fields
  (name, project type, area, budget, timeline) with confidence. Output is stored as an **AI suggestion**, never as confirmed fact,
  and is validated with zod. A human confirms. (Phase 3.)
- **Outbox pattern for HubSpot**: save the lead locally first, queue a sync row, retry later.

## 2. Roles
admin, front_desk, designer, viewer (CEO/board, read-only). Role is stored in `users.role` and can be changed only by server admin code. RLS reads the role from the database, never from the browser.

## 3. Schema
Phase 1 creates: users, sessions, designers, clients, designer_assignments, audit_logs, studio_settings (see `db/migrations/0001_core.sql`).
Later phases: enquiries, call_events, call_summaries, appointments, calendar_blocks (exclusion constraint on tstzrange per designer
using btree_gist, only for confirmed/blocked rows), tasks, deals, hubspot_sync_records, webhook_events (unique provider + event id).
Money = NUMERIC(14,2) + currency 'INR'. Area = NUMERIC + unit. All timestamps timestamptz (UTC), shown in Asia/Kolkata.

## 4. Integration checklist (nothing is claimed working until tested)
| Item | Status | Needed |
|---|---|---|
| Neon Postgres | WORKING (connected, migration applied, 13 tests pass) | rotate the password pasted in chat |
| Neon S3 storage | credentials verified (list buckets OK); no bucket yet, uploads untested | create a bucket when photos/recordings are needed |
| Neon AI Gateway | 403: not enabled on current plan | not used; Gemini is called directly |
| Gemini | WORKING via direct key, model `gemini-3.8-flash` | model name kept configurable |
| Vercel | token given, not yet used | link project, set env vars |
| GitHub | token given, not yet used | confirm repo name + your OK to push |
| HubSpot | token verified read-only (contacts, deals, pipelines, owners). Write access untested | pipeline stage mapping page (Phase 4) |
| VaaniVoice | API key given | webhook/signature scheme unverified; need docs link or support confirmation |
| India compliance | open | call-recording consent, DPDP Act, TRAI rules: owner review before production |

## 5. Phase 1 scope (only this)
1. Next.js scaffold, Tailwind, env handling.
2. SQL migration with RLS for the 6 tables above.
3. Login / logout / admin-run password reset (no email service yet), role-aware sidebar.
4. Admin: create designer, create client, assign client to designer (audited).
5. Designer sees only assigned clients.
6. Tests (RLS + permissions), lint, typecheck, build.

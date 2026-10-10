# Aangan Studio Management Platform

Interior-design studio platform (Pune). Next.js on Vercel, Neon Postgres, HubSpot CRM, VaaniVoice AI phone agent, Gemini, Telegram alerts.

## How it works
1. A customer phones the VaaniVoice agent, which collects the project details.
2. VaaniVoice sends the call report to `POST /api/webhooks/vaani?key=SECRET` (duplicates ignored, raw events stored).
3. Gemini writes short notes + key fields and judges the lead against the owner's rubric (`src/lib/knowledge.ts`).
4. A lead is created in Neon. Database triggers queue (a) a one-way push to HubSpot and (b) a Telegram alert.
5. The admin assigns tasks/meetings to designers (designers accept or reject with a reason). These never go to HubSpot.
6. The admin types the quote / final budget (deal **Amount**) and outcome (**Deal Won / Deal Lost**) in HubSpot. The app never overwrites them. The **Summary** page (admin + CEO) reads them live.

## First-time setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (never commit it).
3. `npm run db:migrate`
4. `npm run create-admin -- you@example.com "a-long-password" "Your Name"`
5. `npm run dev`

## Checks
`npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

## Deployment
- GitHub (private): `HariD1122/aangan-studio`. Every push to `main` deploys to Vercel production.
- Production env vars live in Vercel. Commits must use an email linked to the GitHub account or Vercel blocks the deploy.
- Database changes: add a file in `db/migrations/`, run `npm run db:migrate` (deploys do not migrate).
- A daily Vercel cron (`/api/cron/hubspot`, protected by `CRON_SECRET`) retries anything stuck: HubSpot sync, Telegram alerts, failed call processing.

## One-time setup outside the code
- **VaaniVoice:** Telephony → buy/import a phone number and assign it to the agent. Developers → Webhooks → endpoint = the address shown on the app's Integrations page (already registered).
- **Telegram:** add the bot to the team group, send `/start@<botname>` there, then set `TELEGRAM_CHAT_ID`.
- **HubSpot:** custom fields are created from the Integrations page; set the account currency to INR.

## Demo data
`npm run demo:seed` adds 10 DEMO clients (flagged, with fake contact details). `npm run demo:outcomes` plays the admin's part in HubSpot. `npm run demo:remove` deletes every demo record in Neon and HubSpot.

## Privacy
Transcripts, recordings and raw payloads are admin-only (plus the assigned designer for their client's notes). Telegram messages never include phone numbers or emails. Pricing guidance is never given to customers.

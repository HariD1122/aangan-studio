# Aangan Studio Management Platform

Next.js + Neon Postgres. Secrets live in `.env.local` (never committed; see `.env.example`).

## First-time setup
1. `npm install`
2. Put your Neon connection string in `.env.local` as `DATABASE_URL=`.
3. `npm run db:migrate`   (creates the tables; safe to re-run)
4. `npm run create-admin -- you@example.com "a-long-password" "Your Name"`
5. `npm run dev` then open http://localhost:3000 and sign in.

## Checks
`npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

## Notes
- Permissions are enforced in server code AND by PostgreSQL Row Level Security (`db/migrations/0001_core.sql`).
- Business knowledge for the AI (services, rubric, pricing guide, example enquiries) is in `knowledge/`.

## Deployment
- GitHub repo (private): `HariD1122/aangan-studio`. Pushing to `main` auto-deploys to Vercel (production).
- Production env vars are set in Vercel (DATABASE_URL, GEMINI_API_KEY, HUBSPOT_PRIVATE_APP_TOKEN, VAANIVOICE_API_KEY, AWS_*). Never commit secrets.
- Commits must use an email linked to the GitHub account, or Vercel blocks the deploy.
- Database changes: add a new file in `db/migrations/` and run `npm run db:migrate` (the deploy does not migrate automatically).

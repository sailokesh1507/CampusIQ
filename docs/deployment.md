# Deployment guide

## Vercel deployment

Live production URL: **https://campusiq-eight.vercel.app**

Vercel serves the Vite client from `public/` and routes `/healthz` and `/api/*` through the catch-all Express adapter in `api/index.ts`. The Postgres-backed production function is pinned to `bom1` near the Supabase project region. The adapter preserves the original request path for the shared app. Deploy from the repository with:

```text
npx vercel@latest login
npx vercel@latest --prod
```

Once the project is linked with `npx vercel@latest link --yes --project campusiq`, the repository shortcut is `npm run deploy:vercel`. After deployment, `npm run smoke:live` checks the health endpoint, dashboard, seeded profile, methodology endpoint, and CSV template.

The Vercel function uses `/tmp/campusiq.db` when `DATABASE_DRIVER` is not set or is `sqlite`. This keeps the public synthetic demo usable, but writes are not guaranteed across cold starts or redeploys. For durable operation, set `DATABASE_DRIVER=postgres`, `DATABASE_URL`, `DATABASE_SSL=true`, `DEMO_MODE=false`, and `AUTH_REQUIRED=true` after provisioning the first institution administrator. The Postgres import, intervention, catalog, auth and audit paths are implemented behind the same route surface.

The native `better-sqlite3` binary is explicitly included in the function bundle by `vercel.json`. If a Vercel build reports a native-module compatibility error, use the Render/Docker path documented below, or move the database to a managed service compatible with the repository interface.

After deployment, verify the URL at `/healthz`, `/`, `/api/dashboard`, `/api/students/SYN-007`, and the intervention workflow. The current deployment has been smoke-tested for dashboard, profile, methodology, CSV template, CSV validation/commit, refresh, and intervention CRUD.

For a managed Postgres release, set `DATABASE_DRIVER=postgres` and a temporary `DATABASE_URL` in the shell, then run `npm run db:migrate:postgres`, `npm run db:seed:postgres`, `npm run db:check:postgres`, and `npm run smoke:postgres`. The Postgres smoke script creates isolated temporary institutions, verifies login, imports, interventions and institution isolation, and deletes those records before exiting. After a one-time hosted seed, keep `POSTGRES_SEED_DEMO=false` to avoid repeating seed work on serverless cold starts.

## Single-service deployment

The API serves `public` in production. Build and start commands are:

```text
npm ci
npm run build
npm start
```

Health check: `GET /healthz`.

Set `NODE_ENV=production`, the host-provided `PORT`, `DATABASE_DRIVER`, `DATABASE_URL`, `DATABASE_SSL`, and `APP_BASE_URL`. Keep `VITE_API_URL` blank for the single-service arrangement so the browser uses same-origin `/api` calls. `DATABASE_URL` must be configured as a secret environment variable.

For the current synthetic demo, leave `DEMO_MODE=true` and `AUTH_REQUIRED=false`. For an institution deployment, do not point real data at Vercel's ephemeral `/tmp/campusiq.db`; provision managed Postgres, create the first admin user through a controlled process, set `DATABASE_DRIVER=postgres`, `DEMO_MODE=false`, and `AUTH_REQUIRED=true`. `POSTGRES_SEED_DEMO=true` is reserved for an isolated synthetic workspace and must remain false for institution data.

The production schema is prepared in `src/db/postgres-schema.sql`. Apply it with:

```text
DATABASE_URL=postgres-connection-string npm run db:migrate:postgres
```

The public Vercel demo remains on SQLite until the managed connection and institution data are intentionally configured. The application selects the adapter from `DATABASE_DRIVER`, so an unconfigured Postgres connection cannot silently fall back to ephemeral SQLite.

## Render-style setup

`render.yaml` describes a web service with `npm ci && npm run build` and `npm start`. If a persistent disk is available on the selected plan, mount it and set `DATABASE_PATH=/var/data/campusiq.db`. If not, the application remains usable as a seeded synthetic demo, but SQLite writes may be lost on restart/redeploy. Verify this behavior with a real intervention after deployment before claiming persistence.

## Release smoke test

1. Open `/healthz`.
2. Open `/` and confirm the overview has 54 synthetic students.
3. Open a seeded profile such as `/api/students/SYN-007` and verify score/explanation data.
4. Filter the explorer and confirm counts change.
5. Create or update an intervention, reload, and confirm persistence for the host’s storage model.
6. Download `/api/import/templates/unified`, validate a synthetic row, and review error output.

Do not deploy real student data or API keys. The hosted demo is a decision-support prototype; it has no authentication, institutional connector, notification, or validated predictive model.

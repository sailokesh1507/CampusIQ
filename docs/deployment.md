# Deployment guide

## Vercel deployment

Live production URL: **https://campusiq-eight.vercel.app**

Vercel serves the Vite client from `public/` and routes `/healthz` and `/api/*` through the catch-all Express adapter in `api/index.ts`. The adapter preserves the original request path for the shared app. Deploy from the repository with:

```text
npx vercel@latest login
npx vercel@latest --prod
```

Once the project is linked with `npx vercel@latest link --yes --project campusiq`, the repository shortcut is `npm run deploy:vercel`. After deployment, `npm run smoke:live` checks the health endpoint, dashboard, seeded profile, methodology endpoint, and CSV template.

The Vercel function uses `/tmp/campusiq.db` when `DATABASE_PATH` is not configured. This makes the synthetic demo and intervention workflow usable, but writes are not guaranteed across cold starts or redeploys. Configure a managed database or use the Render/persistent-disk arrangement before claiming durable production persistence. Import previews are staged in SQLite rather than process memory, so validation and commit do not depend on a single warm function instance; durable cross-instance behavior still requires shared storage.

The native `better-sqlite3` binary is explicitly included in the function bundle by `vercel.json`. If a Vercel build reports a native-module compatibility error, use the Render/Docker path documented below, or move the database to a managed service compatible with the repository interface.

After deployment, verify the URL at `/healthz`, `/`, `/api/dashboard`, `/api/students/SYN-007`, and the intervention workflow. The current deployment has been smoke-tested for dashboard, profile, methodology, CSV template, CSV validation/commit, refresh, and intervention CRUD.

## Single-service deployment

The API serves `public` in production. Build and start commands are:

```text
npm ci
npm run build
npm start
```

Health check: `GET /healthz`.

Set `NODE_ENV=production`, the host-provided `PORT`, `DATABASE_PATH`, and `APP_BASE_URL`. Keep `VITE_API_URL` blank for the single-service arrangement so the browser uses same-origin `/api` calls. No credentials are needed for the deterministic product path.

For the current synthetic demo, leave `DEMO_MODE=true` and `AUTH_REQUIRED=false`. For an institution deployment, do not point real data at Vercel's ephemeral `/tmp/campusiq.db`; provision managed Postgres, create the first admin user through a controlled process, set `DEMO_MODE=false`, and set `AUTH_REQUIRED=true`. The repository now includes the auth/session/catalog foundation, but durable Postgres provisioning and enterprise identity integration remain the next backend milestone.

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

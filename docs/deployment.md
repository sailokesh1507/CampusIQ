# Deployment guide

## Single-service deployment

The API serves `dist-client` in production. Build and start commands are:

```text
npm ci
npm run build
npm start
```

Health check: `GET /healthz`.

Set `NODE_ENV=production`, the host-provided `PORT`, `DATABASE_PATH`, and `APP_BASE_URL`. Keep `VITE_API_URL` blank for the single-service arrangement so the browser uses same-origin `/api` calls. No credentials are needed for the deterministic product path.

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

# CampusIQ

CampusIQ is a Student Success Intelligence Platform for faculty and college administrators. It combines synthetic academic, attendance, LMS, engagement, placement, skills, and feedback records into a transparent review workflow:

**Data → Insight → Explanation → Faculty-reviewed action → Follow-up**

The repository contains a React/Vite client and an Express/TypeScript API in one deployable Node service. The default demo dataset contains 54 clearly labelled synthetic students. Scores are deterministic heuristic decision support and are not validated predictions.

> **Synthetic demo data · Heuristic decision support**

## What is implemented

- Live overview KPIs, priority queue, review signals and overlapping cohort segments.
- Searchable student explorer with support flags, coverage and segment membership.
- Student profile drawer with source evidence, missing indicators, score contributions and signal rules.
- Seven data domains: academic (including optional subject performance), attendance (including optional subject-wise attendance), LMS, engagement, placement, skills and feedback.
- Unified CSV template, validation preview, row-level errors, atomic/partial commit modes and import history.
- Persistent SQLite interventions with category, rationale, owner, due date, status and history notes.
- Authentication foundation with demo/production mode, password hashing, HttpOnly sessions, user roles and institution catalog APIs on both SQLite and managed Postgres adapters.
- Methodology page documenting `heuristic-v1`, weights, coverage rules, exclusions and limitations.
- Vitest scoring/import/API coverage and production client/server builds.

## Requirements

- Node.js 24.x (the current implementation was verified with `v24.20.0`)
- npm 12.x

`better-sqlite3` is a native dependency. npm 12 may require install-script approval in a fresh environment:

```powershell
npm install
npm install-scripts approve better-sqlite3
npm install-scripts approve esbuild
npm rebuild better-sqlite3
```

The native SQLite smoke check used during implementation was:

```powershell
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.exec('create table t (n integer)'); db.prepare('insert into t values (?)').run(7); console.log(db.prepare('select n from t').get().n); db.close();"
```

## Run locally

```powershell
copy .env.example .env
npm install
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://localhost:3001>
- Health: <http://localhost:3001/healthz>

## Repository map and workflow

The repository is intentionally a single application with clear boundaries:

| Location | Responsibility |
| --- | --- |
| `src/client` | React UI, API client, styles |
| `src/server` | Express routes and repository orchestration |
| `src/db` | SQLite connection, managed Postgres pool/schema, synthetic seed |
| `src/analytics` | Pure scoring, normalization and segmentation |
| `src/import` | CSV parsing, validation and templates |
| `src/shared` | Shared TypeScript contracts and methodology metadata |
| `api/index.ts` | Vercel adapter for `/healthz` and `/api/*` |
| `docs` | Architecture, methodology, deployment and demo materials |
| `tests` | Scoring, import and API integration tests |

`public/`, `dist-server/`, and `dist-client/` are generated build output and are ignored by Git. `data/campusiq.db` is local synthetic runtime state, `node_modules/` contains installed dependencies, and `.vercel/` contains the local deployment link; none are source files.

With the default `DATABASE_DRIVER=sqlite`, the first server start creates `data/campusiq.db` and idempotently seeds the synthetic dataset. Set `DATABASE_PATH` to use another SQLite location. Set `DATABASE_DRIVER=postgres` with `DATABASE_URL` to use the managed Postgres adapter instead. SQLite files are ignored by Git.

### Demo and production modes

The backend now has an explicit operating-mode boundary:

- `DEMO_MODE=true` (default locally) describes the synthetic demonstration mode. SQLite seeds it automatically; Postgres seeding is explicit through `POSTGRES_SEED_DEMO=true` so a production database cannot be populated accidentally.
- `DEMO_MODE=false` prevents synthetic student seeding. A managed database and an explicit user-provisioning workflow are required before enabling this in a real institution.
- `AUTH_REQUIRED=false` preserves the public hackathon demo flow.
- `AUTH_REQUIRED=true` protects the API and activates the faculty login screen. The auth foundation uses opaque HttpOnly sessions, institution-scoped roles and Node `scrypt` password hashes on either database driver.

Demo credentials are controlled by `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD`; never reuse them for a real institution.

Production-style local run:

```powershell
npm run build
$env:NODE_ENV='production'
$env:PORT='3001'
npm start
```

Managed Postgres run:

```powershell
$env:DATABASE_DRIVER='postgres'
$env:DATABASE_URL='postgres-connection-string'
$env:DATABASE_SSL='true'
$env:DEMO_MODE='false'
$env:AUTH_REQUIRED='true'
npm start
```

## Verification commands

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

The shortest complete local check is:

```powershell
npm run verify
```

Useful release commands:

```powershell
npm run smoke:live
npm run deploy:vercel
```

Managed Postgres verification requires a temporary `DATABASE_URL` environment value and removes its smoke data:

```powershell
npm run db:migrate:postgres
npm run db:seed:postgres
npm run db:check:postgres
npm run smoke:postgres
```

For the public synthetic Postgres demo, seed the database once with `db:seed:postgres`, then keep `POSTGRES_SEED_DEMO=false` in the hosted environment so serverless cold starts do not repeat the seed operation.

To remove reproducible build output without touching source, dependencies, the local database, or the Vercel link:

```powershell
npm run clean
```

The API integration tests start an in-memory SQLite instance, verify seeded dashboard/profile responses, validate and commit a CSV row, and exercise intervention create/status/note persistence. Browser automation is not required for the core test suite.

## API highlights

All JSON API responses use `{ data }`; failures use `{ error: { code, message, fieldErrors? } }`.

| Route | Purpose |
| --- | --- |
| `GET /api/dashboard` | Filtered KPIs, distributions, segments and review queue |
| `GET /api/students` | Search/filter/sort student summaries |
| `GET /api/students/:studentId` | Source values, explanation, segments and interventions |
| `GET /api/methodology` | Published score version, formula and guardrails |
| `GET /api/auth/config` | Auth mode and demo-mode metadata |
| `GET /api/auth/me` | Current authenticated faculty session |
| `POST /api/auth/login` / `POST /api/auth/logout` | Faculty session lifecycle |
| `GET /api/catalog` | Institution departments and programmes |
| `POST /api/catalog/departments` / `POST /api/catalog/programmes` | Admin/coordinator catalog management |
| `GET /api/segments` | Segment definitions and filtered cohorts |
| `GET /api/import/templates/unified` | Download supported CSV template |
| `POST /api/imports/validate` | Multipart CSV preview and row-level errors |
| `POST /api/imports/:batchId/commit` | Commit a validated batch and refresh scores |
| `GET/POST/PATCH /api/interventions...` | Intervention workbench and note history |

## CSV import

The unified CSV requires `student_id`, `observed_at` and at least one measurable value. It supports optional `subject_performance` and `subject_attendance` evidence using `SUBJECT_CODE:0-100;...`. The remaining supported headers are documented in [`docs/data-dictionary.md`](docs/data-dictionary.md). Values are range checked; blank optionals become `NULL`; `cgpa_scale` is required when `cgpa` is supplied; unknown headers, duplicate observations and malformed dates are surfaced. Atomic mode blocks any row error; partial mode commits only accepted rows after an explicit choice. Validated rows are staged in the database rather than Node memory, so a commit is safe across Node-process restarts when the database itself is persistent.

## Deployment

The recommended deployment shape is one Node service because the Express server serves the built Vite client. The repository also includes `vercel.json` and `src/index.ts` for a Vercel deployment. See [`docs/deployment.md`](docs/deployment.md), `Dockerfile`, and `render.yaml`. Configure:

### Live demo

**https://campusiq-eight.vercel.app**

The live production deployment is verified at `/`, `/healthz`, `/api/dashboard`, `/api/students/SYN-007`, `/api/methodology`, and `/api/import/templates/unified`.

- `NODE_ENV=production`
- `PORT` supplied by the host
- `DATABASE_PATH` on a persistent disk if intervention writes must survive restarts
- `DATABASE_DRIVER=postgres` to enable the managed Postgres adapter
- `DATABASE_URL` for the managed Postgres connection
- `DATABASE_SSL=true` for the managed connection pool
- `POSTGRES_SEED_DEMO=true` only for an isolated synthetic Postgres workspace
- `APP_BASE_URL` for documentation/host metadata

No AI provider or secret is required. The optional AI variables are intentionally absent from the frontend and are not needed by the product path. If the selected host does not guarantee persistent disk storage, present this as a seeded synthetic demo and do not claim cross-redeploy persistence.

## Product and demo documents

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/data-dictionary.md`](docs/data-dictionary.md)
- [`docs/score-methodology.md`](docs/score-methodology.md)
- [`docs/demo-script.md`](docs/demo-script.md)
- [`docs/slides-outline.md`](docs/slides-outline.md)
- [`docs/submission-checklist.md`](docs/submission-checklist.md)

## Scope and privacy

This prototype intentionally excludes enterprise SSO, production SIS/LMS connectors, notifications, biometric data, automated adverse decisions, and retrained predictive ML. Do not load real student information into the public demo. Faculty retain judgment at every decision point.

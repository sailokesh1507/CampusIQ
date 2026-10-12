# Submission checklist

- [x] React/Vite frontend and Express backend run from the repository with SQLite demo and managed Postgres production adapters.
- [x] Synthetic demo dataset is clearly disclosed and seeded idempotently.
- [x] All seven official data domains are represented.
- [x] Deterministic `heuristic-v1` score, coverage, component contributions and risk explanations are documented and tested.
- [x] Dashboard, explorer, profile, segments, import center, interventions and methodology views are connected to API data.
- [x] CSV validation reports row-level errors and supports atomic/partial commit.
- [x] Intervention status/note persistence is covered by API integration tests.
- [x] `/healthz`, `Dockerfile`, `render.yaml`, `.env.example` and deployment limitations are documented.
- [x] Hosted URL provisioned and smoke-tested: https://campusiq-eight.vercel.app
- [x] Authentication/session/catalog foundation is covered by API integration tests while demo mode remains safe for judges.
- [x] Complete final hosted smoke test and live Postgres write-path rehearsal.
- [x] Fictional presentation CSV validates cleanly and is loaded into the hosted demo without real student PII.
- [ ] Complete demo rehearsal and submission form.

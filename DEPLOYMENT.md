# Atlas deployment

This keeps the current SQLite database and deploys the UI and API together as one Cloud Run service. Firebase Hosting and PostgreSQL aren’t used.

## Deploy

The workflow in `.github/workflows/deploy.yml` deploys when code is pushed to `main`. Set these GitHub repository variables:

- `GCP_PROJECT_ID`
- `GCP_REGION` (for example, `asia-south1`)
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

Add `APP_LOGIN_KEY` as a GitHub Actions secret. The Cloud Run service receives it as an environment variable; it is never included in the frontend build.

The Google Cloud project needs billing enabled and Cloud Run, Cloud Build, and Artifact Registry APIs enabled. The deploy service account needs permission to build and deploy Cloud Run services. GitHub Actions authenticates with Workload Identity Federation.

## Local configuration

Copy `.env.example` to `.env` and set `APP_LOGIN_KEY`. For local Vite development, copy `frontend/.env.example` to `frontend/.env.local`; set `VITE_API_BASE_URL` to the local backend URL and include the frontend origin in `APP_ALLOWED_ORIGINS`.

## SQLite behavior

Cloud Run is configured for one instance, and SQLite lives at `/tmp/portfolio.db`. The database can reset when Cloud Run replaces or stops that instance, including after idle periods. Guest mode always uses fictional data. The default Cloud Run URL provides HTTPS; no certificate setup is needed.

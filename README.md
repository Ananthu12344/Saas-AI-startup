# Clarity AI

A responsive marketing site with Supabase email/password authentication, built with Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4.

## Development

Run the deterministic checks with:

```bash
npm run test:unit
npm run lint
npm run typecheck
npm run build:webpack
```

`npm run build` uses the default Next.js Turbopack build. If the local
environment blocks Turbopack worker startup, `npm run build:webpack` runs the
same production compilation through Next.js Webpack.

With the disposable Colima-backed Supabase stack running, run the local
database and application integration checks with `npm run test:local`. These
tests create temporary local fixtures and remove them before exiting; they do
not connect to the hosted Supabase project.

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm run build` creates a production build; `npm start` serves it. Run `npm run lint` and `npm run typecheck` before submitting changes.

## Supabase configuration

Set these values in the ignored `.env.local` file:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://fjrajnlbdeazgrcxvbsa.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_public_anon_key
```

Use only a public anon key in browser environment variables. In Supabase Authentication → URL Configuration, set your Site URL and allow both callback URLs for every deployment origin:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/callback?next=/reset-password`

Add the corresponding HTTPS production URLs before deployment. Keep Supabase's default confirmation and recovery email templates unchanged. Confirmation links must be opened in the browser that initiated signup/recovery so the PKCE verifier is available.

The browser/server client and cookie refresh patterns follow [Supabase's official examples](https://github.com/supabase/supabase/tree/master/examples/auth/nextjs). This app retains the requested `ANON_KEY` variable name, keeps marketing/auth routes public, and uses `getClaims()` to refresh sessions. Next.js cannot write cookies during Server Component rendering, so the proxy clears the session on `/logout` before the server page signs out and redirects home. Logout uses a normal anchor to avoid prefetching a sign-out request.

## Structure

- `components/landing/`: sticky header, workspace illustration, six features, pricing, footer.
- `components/auth/auth-form.tsx`: shared login, signup, recovery, and password forms.
- `lib/supabase/`: browser/server clients and session refresh.
- `lib/dashboard/queries.ts`: server-only, RLS-scoped dashboard reads.
- `lib/dashboard/budgets.ts`: explainable budget threshold states.
- `app/dashboard/page.tsx`: first dashboard slice backed by Supabase views.
- `app/auth/callback/route.ts`: exchanges a PKCE code and allows only home or password-reset destinations.
- `app/globals.css`: responsive landing and auth styles.

Pricing and workspace artwork are product previews; billing and AI generation are not implemented.

The local-only `supabase/seed.sql` fixture creates Acme AI and Beta Labs with representative projects, applications, usage, budgets, and heuristic findings. It runs automatically after `supabase db reset`; it is never applied to the hosted project. The dashboard currently selects the first workspace visible to the authenticated user; workspace switching will be added after the first vertical slice is stable.

Dashboard summary periods use UTC. Provider/model/project/application breakdowns and daily history are all-time; only currently active budgets appear. Overlapping workspace budgets are listed separately instead of choosing one arbitrarily. The September 2026 seed uses fixed dates, so current-period cards will be empty outside that period.

View reads paginate in stable order and verify exact row counts. Reports exceeding 10,000 rows per view, incomplete pages, or changing counts fail visibly rather than displaying truncated totals. Pagination and separate view queries are not a transaction snapshot: concurrent ingestion can still change amounts without changing counts. Before production ingestion, review a database-side snapshot/reporting query and scalable date-filtered aggregation.

The current views do not group by currency, and budgets have no currency column. This development dashboard assumes USD budgets and withholds reporting when any non-USD or unknown-cost usage is detected; estimated costs remain labelled as estimates. Proper currency-aware views/budgets require an approved schema change. Potential inefficiency and anomaly findings remain heuristics, not proven savings.

## Usage data model

The initial multi-tenant schema is in `supabase/migrations/20260917000000_usage_platform.sql`. It creates workspaces and memberships, the supported AI providers, server-managed credential references, projects, usage events, budgets, and alerts. Row Level Security scopes every workspace-owned record to its members; owner/admin policies control configuration changes. Credential material is isolated in a table with no browser-role policy and should be resolved by a trusted server or Edge Function.

Dashboard queries can read the security-invoker views `usage_daily`, `usage_cost_by_provider`, `usage_cost_by_model`, `usage_cost_by_project`, `usage_cost_by_application`, `budget_consumption`, `potential_waste`, and `usage_anomalies`. The waste view uses an explicit `request_metadata.waste_reason` or flags requests over 100,000 input tokens; anomaly detection flags daily cost above three population standard deviations from the workspace mean. These are starting heuristics and should be tuned to the product's traffic patterns.

## Provider and cost boundaries

Provider-specific behavior belongs under `lib/providers/`. The first adapter boundary is `ProviderAdapter`; `OpenAIAdapter` normalizes provider records without exposing transport or credentials to client components. Shared normalization lives in `lib/usage/normalize.ts`, and deterministic token-price arithmetic lives in `lib/usage/cost.ts`. Provider polling should run from a trusted server or Edge Function and write immutable events with an idempotency key.

The MVP telemetry choice is provider usage polling. It keeps onboarding and infrastructure simple, but freshness and project/request attribution depend on each provider's usage API; it is not real-time. A gateway and SDK can be added later using the same `ProviderAdapter` and normalized event boundary. The trusted ingestion boundary is `lib/ingestion/ingest.ts`: it resolves enabled providers, validates normalized records, strips sensitive metadata, and uses the database idempotency constraint for safe retries. It must never run in browser code or receive raw provider credentials from a client.

`lib/ingestion/sync.ts` handles the shared polling mechanics: credential validation, cursor pagination, checkpoint advancement only after a successful page write, and a hard page limit. `lib/ingestion/checkpoints.ts` persists cursors by workspace/provider/credential, while `lib/ingestion/run.ts` composes checkpoints, pricing, and ingestion for a trusted worker.

`lib/providers/http.ts` provides same-origin HTTPS JSON transport without logging keys. `lib/providers/credentials.ts` reads isolated ciphertext only through an injected server-side decryptor, and `lib/providers/validation.ts` rejects malformed normalized pages before ingestion. The OpenAI HTTP response parser remains separate provider work; this boundary intentionally does not guess a provider API contract.

`lib/usage/pricing-repository.ts` loads effective-dated model pricing from Supabase. Historical cost calculation still requires an approved provider pricing catalog and a protected key-management implementation in the worker environment.

The migration has been validated against a disposable local Supabase database and remains unapplied to the remote project. Before deployment, validate its RLS policies with two authenticated workspaces, verify that ordinary clients cannot insert usage or read credential secrets, and review the migration against an isolated Supabase environment.

Membership authorization keeps owner changes owner-only, makes `workspace_id` and `user_id` immutable, removes the redundant creator self-insert policy, and serializes owner removal through the workspace row. A retained workspace must always keep one owner; trusted workspace deletion may still cascade memberships.

## Database tests

The SQL tests in `supabase/tests/` use pgTAP fixtures to verify workspace isolation, role boundaries, secret protection, trusted-only usage ingestion, and aggregate arithmetic. Run them only against a disposable local or isolated Supabase database with the migration loaded; they wrap their fixtures in transactions and do not represent production data. The pinned Supabase CLI is available as a development dependency, and the tests run locally with Colima or another Docker-compatible runtime:

```bash
DOCKER_HOST=unix://$HOME/.colima/default/docker.sock \\
DOCKER_CONFIG=/tmp/clarity-docker \\
npx supabase test db
```

The membership suite includes owner/admin/member authorization and isolation checks. `node tests/integration/membership-concurrency.local.cjs` runs two-session owner-removal and demotion races at READ COMMITTED and REPEATABLE READ against the disposable local database.

`node tests/integration/ingestion.local.mjs` verifies the local trusted ingestion path, duplicate replay behavior, and metadata minimization. It uses temporary local data and removes it when complete.

The sync unit suite covers cursor resume, failed writes, credential validation, and runaway pagination with `node --test tests/unit/sync.test.mjs`.

The `api_credential_secrets` table stores only a reference and, when used, application-encrypted ciphertext. Encryption keys must remain outside PostgreSQL in a server-only secret manager or protected runtime configuration. Browser roles have no table privileges, and provider credentials must never be returned to client components, logged, or placed in `NEXT_PUBLIC_*` variables.

## Authentication checks

Run `node tests/integration/dashboard.local.cjs` from the repository root with the disposable local Supabase stack running and its seed loaded. This regression test starts an isolated Next.js server on port 3017, authenticates temporary users, and checks dashboard tenant isolation and the signed-in no-workspace state. It includes the session proxy but substitutes a minimal visual layout to avoid external font downloads; it does not test browser appearance. Temporary users and the app copy are removed afterward. Local credentials stay in memory, and `.env.local` is not copied. No packages or remote services are needed.

The integration suite also adds and removes temporary usage to verify more than 1,000 model groups and withheld reporting for mixed currencies or unknown prices. Run `node --test tests/unit/dashboard.test.mjs` on a Node.js version supporting native TypeScript stripping for deterministic UTC-period, budget, and pagination failure-case tests.

1. Sign up with a test email; follow its confirmation link and verify the avatar appears.
2. Choose Logout; verify the Login link appears immediately and remains after refreshing.
3. Log in with valid credentials, then verify incorrect credentials show an error.
4. Request a password reset; open its email in the same browser, choose matching passwords, and verify the new password works.
5. Open `/reset-password` without a session and `/auth/callback` without a code; verify recovery guidance appears.
6. Check mobile navigation, keyboard focus, and the avatar dropdown.

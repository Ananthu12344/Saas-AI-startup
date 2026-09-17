# Clarity AI

A responsive marketing site with Supabase email/password authentication, built with Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4.

## Development

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
- `app/auth/callback/route.ts`: exchanges a PKCE code and allows only home or password-reset destinations.
- `app/globals.css`: responsive landing and auth styles.

Pricing and workspace artwork are product previews; billing and AI generation are not implemented.

## Usage data model

The initial multi-tenant schema is in `supabase/migrations/20260917000000_usage_platform.sql`. It creates workspaces and memberships, the supported AI providers, server-managed credential references, projects, usage events, budgets, and alerts. Row Level Security scopes every workspace-owned record to its members; owner/admin policies control configuration changes. Credential material is isolated in a table with no browser-role policy and should be resolved by a trusted server or Edge Function.

Dashboard queries can read the security-invoker views `usage_daily`, `usage_cost_by_provider`, `usage_cost_by_model`, `usage_cost_by_project`, `usage_cost_by_application`, `budget_consumption`, `potential_waste`, and `usage_anomalies`. The waste view uses an explicit `request_metadata.waste_reason` or flags requests over 100,000 input tokens; anomaly detection flags daily cost above three population standard deviations from the workspace mean. These are starting heuristics and should be tuned to the product's traffic patterns.

## Provider and cost boundaries

Provider-specific behavior belongs under `lib/providers/`. The first adapter boundary is `ProviderAdapter`; `OpenAIAdapter` normalizes provider records without exposing transport or credentials to client components. Shared normalization lives in `lib/usage/normalize.ts`, and deterministic token-price arithmetic lives in `lib/usage/cost.ts`. Provider polling should run from a trusted server or Edge Function and write immutable events with an idempotency key.

The migration has been validated against a disposable local Supabase database and remains unapplied to the remote project. Before deployment, validate its RLS policies with two authenticated workspaces, verify that ordinary clients cannot insert usage or read credential secrets, and review the migration against an isolated Supabase environment.

## Database tests

The SQL tests in `supabase/tests/` use pgTAP fixtures to verify workspace isolation, role boundaries, secret protection, trusted-only usage ingestion, and aggregate arithmetic. Run them only against a disposable local or isolated Supabase database with the migration loaded; they wrap their fixtures in transactions and do not represent production data. The pinned Supabase CLI is available as a development dependency, and the tests run locally with Colima or another Docker-compatible runtime:

```bash
DOCKER_HOST=unix://$HOME/.colima/default/docker.sock \\
DOCKER_CONFIG=/tmp/clarity-docker \\
npx supabase test db
```

The `api_credential_secrets` table stores only a reference and, when used, application-encrypted ciphertext. Encryption keys must remain outside PostgreSQL in a server-only secret manager or protected runtime configuration. Browser roles have no table privileges, and provider credentials must never be returned to client components, logged, or placed in `NEXT_PUBLIC_*` variables.

## Authentication checks

1. Sign up with a test email; follow its confirmation link and verify the avatar appears.
2. Choose Logout; verify the Login link appears immediately and remains after refreshing.
3. Log in with valid credentials, then verify incorrect credentials show an error.
4. Request a password reset; open its email in the same browser, choose matching passwords, and verify the new password works.
5. Open `/reset-password` without a session and `/auth/callback` without a code; verify recovery guidance appears.
6. Check mobile navigation, keyboard focus, and the avatar dropdown.

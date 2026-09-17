# First deployment

## Recommendation

Use Vercel for the Next.js application and Supabase for authentication and PostgreSQL. The repository is a standard Next.js App Router application with Node.js route handlers, so it needs no custom server. Provider polling remains a trusted worker concern; this first deployment should expose the application and credential-entry route only. Add a separately authenticated production polling job after the live credential path is verified.

## Vercel setup

1. Import `git@github.com:Ananthu12344/Saas-AI-startup.git` in Vercel.
2. Select the production branch (`main`) and keep the framework preset as **Next.js**.
3. Use `npm ci` for installation and `npm run build:webpack` for the build. The validated runtime is Node.js; select the current LTS supported by the project.
4. Add the production domain in Vercel and configure DNS only after reviewing the generated domain.
5. Add these variables to the **Production** environment only:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
CLARITY_CREDENTIAL_MASTER_KEY=<base64-encoded-32-byte-key>
CLARITY_CREDENTIAL_KEY_VERSION=v1
```

The first two are intentionally public Supabase client configuration. The last three are server-only and must never use `NEXT_PUBLIC_`. Preserve an existing valid master key during rotation; retain old key versions until all old ciphertext is re-encrypted.

6. Redeploy after saving variables. Environment changes apply to new deployments.

## Secure credential entry

Create an `api_credentials` metadata row as an authenticated workspace owner/admin, then use its UUID in:

```text
https://<production-domain>/api/credentials/<credential-id>/secret
```

Send an authenticated HTTPS `POST` with `Content-Type: application/json` and body `{"secret":"<OpenAI organization admin key>"}`. The route checks the session and workspace role, encrypts server-side, and returns only `{ "ok": true }`.

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

## Authentication checks

1. Sign up with a test email; follow its confirmation link and verify the avatar appears.
2. Choose Logout; verify the Login link appears immediately and remains after refreshing.
3. Log in with valid credentials, then verify incorrect credentials show an error.
4. Request a password reset; open its email in the same browser, choose matching passwords, and verify the new password works.
5. Open `/reset-password` without a session and `/auth/callback` without a code; verify recovery guidance appears.
6. Check mobile navigation, keyboard focus, and the avatar dropdown.

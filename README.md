# VitaPass

VitaPass is a responsive, four-language medical-profile application built with
Next.js 16 App Router. The public patient route remains a fictional browser-only
prototype. Phase 2B.1 adds a secure, database-backed clinician vertical slice
using Supabase Auth and hosted PostgreSQL.

## Routes

- `/` — public fictional patient prototype.
- `/doctor/login` — clinician email/password authentication.
- `/doctor` — server-protected clinician workspace for approved clinicians.

There is no public clinician signup. Patient authentication and durable patient
editing are outside this phase.

## Architecture

```text
Next.js 16 App Router on Vercel
  |
  +-- Server Components / Server Actions
  +-- lib/dal/                       authorization + medical data boundary
  +-- lib/supabase/                  request-scoped SSR clients
  +-- proxy.ts                       doctor-route session refresh
  +-- app/i18n/                      typed EN/DE/RO/HU catalogs
  |
Supabase
  +-- Auth                           password authentication and cookie sessions
  +-- hosted PostgreSQL              application and medical records
  +-- Row-Level Security             primary data authorization boundary
  +-- restricted database functions profile audit + condition-note edit
```

Server authorization validates signed identity with `auth.getClaims()`. It does
not trust `getSession()` data. Every normal request uses the public publishable
key and the authenticated user's JWT; no service-role key is used by the app.
RLS and the Data Access Layer independently check clinician approval and active,
unexpired grants.

Authenticated pages are dynamic and use private, no-store responses. Medical
information must never be placed in URLs, logs, analytics, exception messages,
or audit metadata.

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project
- Supabase CLI and a Docker-compatible container runtime for local database work

## Application configuration

Copy the template:

```bash
Copy-Item .env.example .env.local
```

On macOS or Linux:

```bash
cp .env.example .env.local
```

Set exactly these values from the Supabase project Connect dialog:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Both values are required locally and in Vercel for clinician authentication.
They are public project configuration, not privileged credentials. Never add a
service-role or secret key to browser code or this repository.

Without these values, `/` remains operational and `/doctor/login` displays a
localized setup notice.

## Database setup

The versioned schema is in
`supabase/migrations/202607290001_phase_2b1_foundation.sql`. The optional
`supabase/seed.sql` contains only clearly fictional records and never creates an
Auth user or password.

Local Supabase:

```bash
npx supabase init
npx supabase start
npx supabase db reset
```

For a hosted development project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push --include-seed
```

Do not run the seed against an environment intended for real data.

## Supabase Dashboard steps

1. Create or choose the Supabase project.
2. In Authentication settings, keep email/password enabled and disable public
   user signup for this phase.
3. Apply the migration, optionally including the fictional development seed.
4. In Authentication > Users, administratively create or invite the clinician.
   Choose the password outside the repository.
5. Copy that Auth user's UUID and link it to the fictional seeded clinician:

```sql
update public.clinicians
set auth_user_id = 'AUTH_USER_UUID'
where professional_identifier = 'DEMO-CLINICIAN-0001';
```

6. Confirm the clinician remains `approved`. Use `pending`, `suspended`, or
   `rejected` to verify the denial screens.
7. In Project Settings > API/Connect, copy only the Project URL and publishable
   key into local and Vercel environment variables.

## Development and validation

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

The automated suite checks authorization decisions, grant expiry and edit
permissions, audit immutability, RLS policy presence, translation parity,
committed-secret detection, UTF-8 integrity, and the production build.

## Vercel deployment

1. Import the repository into Vercel as a Next.js project.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Preview and Production as
   appropriate.
3. Add the Vercel deployment origins to Supabase Auth URL configuration.
4. Keep the default `next build` command and deploy.

## Security boundary

Read [SECURITY.md](SECURITY.md) before using the project. This vertical slice is
a security foundation, not a complete production medical-record system.

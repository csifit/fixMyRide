# VitaPass

VitaPass is a responsive, multilingual medical-profile prototype with separate patient and clinician experiences. It runs on standard Next.js 16 using the App Router and is ready for deployment to Vercel.

## Current product surface

- `/` — patient medical profile, emergency view, profile sharing controls, multilingual copy, and access history.
- `/doctor` — clinician overview, patient search, profile review drawer, access-request decisions, and activity history.
- Responsive desktop and mobile layouts.
- Open Graph and X sharing metadata.

The current data is deliberately local prototype data in `app/demo-data.ts`. There is no database, authentication, API, or durable server state yet. Interactive decisions and notifications reset when the page reloads.

## Architecture

```text
Next.js 16 App Router
  |
  +-- app/layout.tsx                 metadata and global shell
  +-- app/page.tsx                   patient route
  +-- app/doctor/page.tsx            clinician route
  +-- app/PatientPortalClient.tsx    patient interactions
  +-- app/doctor/DoctorPortalClient.tsx
  +-- app/i18n/                     typed EN/DE/RO/HU catalogs and formatters
  +-- app/demo-data.ts               temporary prototype records
  +-- app/globals.css                shared responsive styling
```

Pages remain Server Components and pass serializable demo data into interactive Client Components. There are no Cloudflare bindings, Workers, Vinext adapters, Vite plugins, Sites metadata, or database migrations.

All interface copy is resolved through the centralized catalogs in `app/i18n`. The
selected language is shared by both portals and persisted in local browser storage.
Dates and times are stored as ISO values and rendered with locale-aware `Intl`
formatters. Demo clinical concepts use stable keys; names, identifiers, phone
numbers, medication names, and dosages remain unchanged.

## Requirements

- Node.js 20.9 or newer
- npm

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the patient portal or [http://localhost:3000/doctor](http://localhost:3000/doctor) for the clinician portal.

## Production validation

```bash
npm run build
npm start
```

Additional checks:

```bash
npm run lint
npm test
```

The project uses the standard Next.js scripts:

- `next dev`
- `next build`
- `next start`

## Deploy to Vercel

Vercel supports Next.js without a custom adapter or configuration file.

### Git deployment

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. In the Vercel dashboard, choose **Add New → Project** and import the repository.
3. Confirm the detected framework is **Next.js**.
4. Leave the build command and output settings at their defaults.
5. Deploy.

Vercel creates preview deployments for subsequent branches and pull requests and updates production from the configured production branch.

### Vercel CLI

Install or invoke the Vercel CLI, then run:

```bash
npx vercel
```

Follow the prompts to link or create a project. To publish the linked project to production:

```bash
npx vercel --prod
```

No environment variables are required. If a canonical production URL is needed for local metadata builds, set the non-secret value:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

On Vercel, VitaPass automatically uses `VERCEL_PROJECT_PRODUCTION_URL` when available.

See the official [Next.js installation documentation](https://nextjs.org/docs/app/getting-started/installation) and [Next.js on Vercel](https://vercel.com/frameworks/nextjs).

## Security boundary

This repository is a UI prototype, not a production medical-record system.

- The displayed patient and clinician identities are sample data.
- Buttons simulate workflows in browser memory.
- No access decision, clinical update, share link, or audit event is durable.
- There is no authentication or authorization boundary.
- Do not enter real patient information or secrets.

Before production use, add an approved identity provider, server-enforced roles, audited persistence, consent and access-grant workflows, encryption and key management, retention policies, backup and recovery, and the required legal and regulatory controls.

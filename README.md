# pitster

pitster is a multilingual vehicle-service marketplace built with Next.js,
Supabase, and Stripe. Customers manage vehicles and service requests; workshop
teams manage their catalogue, booking inbox, repair lifecycle, and subscription.

Production site: [https://www.pitster.app](https://www.pitster.app)

## Local setup

Requirements: Node.js 20.9 or newer, npm, a Supabase project, and the Supabase
CLI.

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Configure the public Supabase values and `NEXT_PUBLIC_SITE_URL`. Server-side
workflows also require the relevant Supabase, email, SMS, and Stripe secrets
listed in `.env.example`; never expose them through `NEXT_PUBLIC_` variables.

## Stripe billing

The workshop subscription uses Stripe-hosted Checkout and the Stripe customer
portal. Configure the webhook destination as:

```text
https://www.pitster.app/api/stripe/webhook
```

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and
`STRIPE_STANDARD_MONTHLY_PRICE_ID` in the deployment environment. The complete
event list and deployment order are in
[`docs/stripe-billing.md`](docs/stripe-billing.md).

## Database and validation

Versioned schema changes live in `supabase/migrations/`. Review the pending
operations before applying them:

```powershell
npx supabase db push --dry-run
npx supabase db push
npm run lint
npm test
npm run build
```

Historical medical-domain migrations and compatibility identifiers such as
`vitapass_id` remain intentionally unchanged until the legacy-retirement phase.
The current implementation plan is in [`docs/roadmap.md`](docs/roadmap.md).

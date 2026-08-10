# pitster completion roadmap

## Current foundation

- Public workshop discovery and workshop detail pages
- Customer accounts, vehicles, My Garage, and service-request submission
- Workshop-managed service catalogues
- Supabase authentication, authorization, RLS, localization, and admin foundation

## Ordered milestones

1. **Automotive domain migration** — implement the approved
   [domain migration specification](automotive-domain-migration.md) across the
   database, application, routes, tests, and documentation.
2. **Workshop request inbox** — list, filter, confirm, reschedule, and decline
   service booking requests with enforced lifecycle transitions.
3. **Customer booking management** — status timeline, proposed-time response,
   cancellation, and confirmed appointment details.
4. **Workshop operations settings** — public profile, opening hours, closures,
   lead time, capacity, mobility options, and booking availability.
5. **Repair lifecycle** — check-in, diagnosis, estimate approval, work progress,
   collection, and completion with immutable status history.
6. **Notifications** — localized, idempotent email/SMS lifecycle messages with
   retry and audit support.
7. **Commercial and admin conversion** — provider subscriptions, invoicing,
   exports, access enforcement, and automotive administrative operations.
8. **Legacy retirement** — remove active medical routes, terminology, code, seed
   data, and compatibility database objects after retention checks.
9. **Quality gates** — authorization and RLS matrices, hosted integration and
   browser tests, accessibility, localization, responsive design, performance,
   rate limiting, and CI consolidation.
10. **Production launch** — environment configuration, backups and restoration,
    observability, operational runbooks, beta acceptance, rollback, and release.

## Current progress

- Diagnosis-first catalogue: implemented locally with four vehicle-specific
  service-template groups, a mandatory positive workshop diagnosis fee before
  publication, direct routine-service booking, and customer fee disclosure;
  migration 033 remains to be applied.
- Workshop request inbox: implemented and deployed.
- Customer booking management: implemented and deployed.
- Application domain cutover: implemented and deployed with canonical customer
  and workshop-manager authentication, registration, routes, DAL modules, and
  temporary legacy redirects.
- Workshop operations settings: implemented locally with public-profile editing,
  weekly hours, exceptional closures, lead time, horizon, daily capacity,
  mobility options, and database-enforced booking availability; migration 029
  and hosted smoke tests remain.
- The canonical release gate is `npm test`. The obsolete medical-product test
  command has been retired; retained database compatibility is covered only by
  targeted migration and security regression tests.
- Repair lifecycle is implemented in migrations 030–031 and the workshop/customer
  interfaces; deployment and hosted smoke testing remain.
- Stripe provider subscriptions, invoicing, commercial exports, and automotive
  provider administration are implemented in migration 032 and the provider/admin
  workspaces; deployment and Stripe test-mode smoke testing remain.
- Workshop calendar and manual appointment entry are implemented and deployed,
  including role-specific collapsible navigation.
- The customer SMS lifecycle is implemented locally in migration 035 with
  exactly five deduplicated event kinds: booking confirmation, 24-hour reminder,
  repair started, ready for pickup, and review request. Every localized message
  is capped at 150 characters; deployment and cron scheduling remain.
- Legacy retirement is in progress. Migration 036 and the active `/admin`
  workspace now use only canonical providers, workshops, customers, workshop
  managers, bookings, and SMS operations. Medical admin mutation modules have
  been removed. Migration 037 moves catalogue and booking ownership constraints
  to canonical workshops, with validated backfill and nullable derived rollback
  references; it is ready to apply. Redirect routes and the remaining
  compatibility database objects stay until their comparison and retention
  checks are complete.
- Migration 038 makes public registration canonical-only, records the structural
  row-count/checksum comparison, and removes every legacy-to-canonical forward
  synchronization trigger.
- The post-038 application cleanup removes all medical redirect routes,
  unreachable medical UI/DAL/email modules, legacy proxy matchers, and the old
  appointment notification dispatcher. Historical migrations and retained
  database records remain unchanged. Deployment scheduling must call
  `/api/cron/service-booking-notifications` with the existing cron secret.
- The canonical UI audit removes medical-only translation namespaces and dead
  clinic-era styles in all four languages while retaining shared authentication,
  workshop workspace, address-search, and commercial export labels.
- The multi-location expansion in migration 039 adds role-neutral account status
  history, organisation/location invitations, location-scoped manager
  assignments, one Stripe customer per organisation, and one shadow subscription
  per workshop. Existing authorization, publication, and provider billing remain
  authoritative until their separately tested cutovers.
- Migration 040 and the admin console implement the Step 2 workflow: an MFA-
  protected administrator can invite an organisation owner, create a geocoded
  workshop location, invite or directly assign its manager, and auditably manage
  role-neutral account status. Invitations are one-time hashed links; accepting
  one creates the canonical manager identity and assignment. Location billing
  activation and public publication remain later cutovers.

Each milestone is complete only when its migration is reviewed, automated tests
and production build pass, all four languages are present, and the hosted
development smoke test succeeds.

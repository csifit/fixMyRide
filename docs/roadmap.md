# fixMyRide completion roadmap

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

Each milestone is complete only when its migration is reviewed, automated tests
and production build pass, all four languages are present, and the hosted
development smoke test succeeds.

# Legacy retirement audit

## Retired in migration 036 release

- The active platform-admin snapshot and UI no longer read clinicians, patients,
  clinics, clinic locations, or medical appointment tables.
- Medical admin mutation actions and DAL modules are removed.
- Unreachable medical React clients beneath redirect-only routes are removed.
- Local seed data is automotive-only and contains no medical records.

## Retired in migration 037 release

- `workshop_services.workshop_id` and
  `service_booking_requests.workshop_id` now reference canonical `workshops`.
- The migration refuses to proceed if any catalogue or booking row cannot be
  mapped, or if a booking's selected service belongs to another workshop.
- Public catalogue and booking creation, manager catalogue/manual appointments,
  customer and manager booking reads, SMS claims, and admin counts now use the
  canonical workshop identifier.
- The application no longer sends service-provider IDs under clinic argument
  names or canonical workshop IDs under workshop-profile argument names.

## Retired in migration 038 release

- Public customer and workshop-manager registration writes canonical automotive
  identities, providers, memberships, workshops, and commercial records directly.
- The migration validates every legacy-to-canonical structural mapping and stores
  row counts and deterministic checksums in
  `private.legacy_sync_retirement_audits` before changing trigger state.
- All legacy-to-canonical account, customer, provider, manager, membership, and
  workshop refresh triggers and their private implementation functions are removed.
- Former synchronization source tables become read-only so privileged legacy
  RPCs cannot create new divergence after the recorded comparison.
- `target_account_type` is now supplied explicitly and protected by a database
  consistency constraint while the legacy `account_type` shadow remains.

## Temporarily retained

- Redirect-only routes remain for one compatibility window. They contain no
  medical UI or data access.
- Historical migrations remain immutable. They describe the deployed schema and
  must never be deleted or rewritten.
- Legacy database tables remain for the retention window.
- Nullable `legacy_workshop_profile_id` columns remain on catalogue and booking
  rows as trigger-maintained rollback references. They have no foreign keys and
  are not authoritative ownership fields.
- The old appointment notification dispatcher remains until pending historical
  rows are counted and either delivered, cancelled, or retained by policy.
- Legacy billing/export functions remain until accounting retention is approved.

## Read-only production checks before database retirement

Run these queries in the Supabase SQL editor and retain the results with the
release record:

```sql
select 'clinicians' object, count(*) rows from public.clinicians
union all select 'patients', count(*) from public.patients
union all select 'appointments', count(*) from public.appointments
union all select 'pending appointment notifications', count(*)
  from public.appointment_notifications where status in ('pending', 'failed', 'processing')
union all select 'clinic locations', count(*) from public.clinic_locations
union all select 'legacy workshop profiles', count(*) from public.workshop_profiles;

select count(*) as catalogue_rows_with_mismatched_legacy_reference
from public.workshop_services service
join public.workshops workshop on workshop.id = service.workshop_id
where service.legacy_workshop_profile_id is distinct from
  workshop.legacy_workshop_profile_id;

select count(*) as booking_rows_with_mismatched_ownership
from public.service_booking_requests booking
join public.workshop_services service on service.id = booking.service_id
where booking.workshop_id <> service.workshop_id;

select count(*) as identities_missing_canonical_role
from public.account_identities
where target_account_type is null;
```

## Next retirement slice

1. Apply the approved retention policy to medical records and accounting data.
2. Remove redirect routes, legacy backend modules, and proxy matchers.
3. Drop compatibility database objects only in a separately reviewed migration
   with a backup and rollback plan.

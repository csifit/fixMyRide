# Legacy retirement audit

## Retired in migration 036 release

- The active platform-admin snapshot and UI no longer read clinicians, patients,
  clinics, clinic locations, or medical appointment tables.
- Medical admin mutation actions and DAL modules are removed.
- Unreachable medical React clients beneath redirect-only routes are removed.
- Local seed data is automotive-only and contains no medical records.

## Temporarily retained

- Redirect-only routes remain for one compatibility window. They contain no
  medical UI or data access.
- Historical migrations remain immutable. They describe the deployed schema and
  must never be deleted or rewritten.
- Legacy database tables and synchronization triggers remain because current
  service catalogue and booking foreign keys still point through
  `workshop_profiles`, `workshop_services`, and `service_booking_requests`.
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

select count(*) as bookings_missing_canonical_workshop
from public.service_booking_requests booking
left join public.workshops workshop
  on workshop.legacy_workshop_profile_id = booking.workshop_id
where workshop.id is null;

select count(*) as identities_missing_canonical_role
from public.account_identities
where target_account_type is null;
```

## Next retirement slice

1. Move service catalogue and booking foreign keys from legacy workshop profiles
   to canonical workshops.
2. Stop and remove forward-sync triggers after row-count and checksum comparison.
3. Apply the approved retention policy to medical records and accounting data.
4. Remove redirect routes, legacy backend modules, and proxy matchers.
5. Drop compatibility database objects only in a separately reviewed migration
   with a backup and rollback plan.

# Automotive domain migration specification

Status: approved for implementation  
Date: 2026-08-06

## Objective

Remove medical-domain names from the active fixMyRide product and database while
preserving identities, workshop data, service catalogues, booking requests, and
billing history. Historical migrations remain immutable; all changes are made
through new forward migrations.

## Canonical vocabulary

| Meaning | Canonical term | Identifier |
| --- | --- | --- |
| Company or sole trader operating locations | Service provider | `service_provider` |
| Physical, public, bookable location | Workshop | `workshop` |
| User administering one or more workshops | Workshop manager | `workshop_manager` |
| User handling workshop operations | Workshop staff | `workshop_staff` |
| Sole trader providing services without a workshop organization | Independent service provider | `independent_service_provider` |
| Person requesting vehicle work | Customer | `customer` |
| A catalogue offering such as diagnostics or brakes | Workshop service | `workshop_service` |
| Initial request for workshop work | Service booking request | `service_booking_request` |
| Confirmed reserved time | Booking | `booking` |

`service` must not be used as a synonym for a company or physical location. It
is reserved for catalogue offerings and service work.

## Target account roles

Replace `vitapass_account_type` with a product-neutral `platform_account_type`.
A new enum is safer than trying to remove or repurpose PostgreSQL enum values.

| Legacy value | Target value |
| --- | --- |
| `patient` | `customer` |
| `doctor` | `independent_service_provider` |
| `clinic_manager` | `workshop_manager` |
| `staff` | `workshop_staff` |
| `platform_manager` | `platform_manager` |
| `platform_admin` | `platform_admin` |
| `superadmin` | `superadmin` |

Every Auth user keeps the same UUID. The cutover migration must reject mixed or
unmapped identities before changing `account_identities.account_type`.

## Target database model

### Objects that can be migrated directly

| Legacy object | Target object | Notes |
| --- | --- | --- |
| `clinics` | `service_providers` | Legal name, display name, country, status, and billing ownership |
| `clinic_locations` | `workshops` | Physical address, coordinates, status, contact details, and operating dates |
| `clinic_manager_profiles` | `workshop_manager_profiles` | Preserve primary keys and Auth user links |
| `clinic_manager_memberships` | `workshop_manager_memberships` | Replace `clinic_id` with `service_provider_id` |
| `clinic_manager_membership_role` | `workshop_manager_membership_role` | Preserve `owner` and `manager` values |
| `clinic_location_status_history` | `workshop_status_history` | Preserve audit timestamps and administrators |
| `clinic_sponsorship_periods` | `service_provider_sponsorship_periods` | Preserve commercial history if still required |
| `get_clinic_billing_usage` | `get_service_provider_billing_usage` | Remove doctor-count and per-SMS assumptions |

### Objects requiring consolidation

`workshop_profiles` and `clinic_locations` currently represent overlapping
parts of a workshop. The target `workshops` table owns both:

- `service_provider_id`
- public slug and description
- public phone and email
- address, city, country, latitude, and longitude
- booking acceptance and mobility options
- operational status and effective dates

Existing `workshop_services` and `service_booking_requests` foreign keys must
point to the resulting `workshops.id` values.

Migration rule:

1. Each legacy `clinic_location` becomes a workshop and keeps its UUID.
2. The oldest active location for a service provider is its primary workshop.
3. The provider's existing `workshop_profile` fields, services, and booking
   requests move to that primary workshop.
4. Additional locations start with an empty catalogue. Catalogue cloning must
   be an explicit manager action, never an implicit migration side effect.
5. A provider without a location receives one workshop using the legacy
   `workshop_profile` UUID and available provider address fields.

The preflight query must report providers with zero or multiple active locations
before this rule is applied.

### Medical objects that must not be mechanically renamed

Medical tables contain incompatible fields and must not become automotive
tables through search-and-replace.

- `patients` is not renamed. `customer_profiles` is already the automotive
  identity. Copy only applicable identity/contact data, remove the temporary
  patient-sync trigger after verification, and retire the medical record graph.
- `clinicians` is not renamed. Create
  `independent_service_provider_profiles` and selectively migrate Auth identity,
  display name, languages, contact information, and applicable billing data.
  Medical specialty, credential, and clinical fields are not copied blindly.
- `appointments`, `public_appointment_requests`, availability tables, patient
  grants, and medical notification tables are not renamed. The automotive
  `service_booking_requests` workflow replaces them.
- Medical record tables remain isolated until a later reviewed removal
  migration confirms that no active code or required retention policy uses them.

### Staff and invitations

Create `workshop_staff_profiles` and `workshop_staff_memberships`. Staff must be
assigned to a service provider or workshop, not to a doctor.

Replace medical invitation kinds with automotive kinds in a new enum:

- `workshop_manager`
- `workshop_staff`
- `independent_service_provider`

Invitation tokens already issued under legacy kinds may be allowed to expire or
be revoked during cutover. They must not silently create the wrong account role.

### Authorization objects

Every renamed table requires correspondingly named:

- RLS policies
- security-definer helper functions
- public RPCs and grants
- audit triggers
- foreign-key constraints and indexes
- registration and invitation handlers

The authorization rule for workshop management remains: an active
`workshop_manager` with an active owner/manager membership may manage workshops
owned by that membership's active service provider.

## Application mapping

### Routes

| Legacy route | Target route |
| --- | --- |
| `/clinic-manager` | `/workshop-manager` |
| `/clinic-manager/clinics` | `/workshop-manager/workshops` |
| `/clinic-manager/services` | `/workshop-manager/services` |
| `/clinic-manager/invoicing` | `/workshop-manager/invoicing` |
| `/doctor` | `/service-provider` |
| `/doctors/[id]` | `/service-providers/[id]` if retained |
| `/patient` | `/customer` |
| `/patient/appointments` | `/customer/bookings` |
| `/appointments` | `/bookings` |
| `/staff` | `/workshop-staff` |

Old public and login URLs receive temporary redirects for one release. Server
actions, callback URLs, emails, and Auth redirect allowlists must use target
routes before redirects are removed.

### Code areas

Rename active modules and exported types in the same slice as their consumers:

- `lib/dal/admin-clinics.ts` to `admin-workshops.ts`
- clinic organization DAL types to service-provider types
- clinic manager access states to workshop manager states
- doctor/public appointment modules only when their replacement flow is ready
- translation keys, email subjects, CSV headers, analytics labels, and CSS class
  names that expose medical terminology

Do not rename historical test descriptions merely to make a text search pass.
New automotive tests become the release gate; legacy tests remain until their
corresponding compatibility surface is removed.

## Safe rollout sequence

### Migration A: preflight and schema expansion

- Audit identity collisions and provider/location cardinality.
- Create new enums and target tables.
- Add target indexes, constraints, RLS, and grants.
- Do not change the running application's reads yet.

### Migration B: deterministic data copy

- Preserve UUIDs wherever one legacy row maps to one target row.
- Build service providers, workshops, memberships, and independent profiles.
- Repoint or copy workshop service and booking relationships.
- Validate row counts, foreign keys, uniqueness, and Auth identity coverage.
- Make the migration idempotent where practical.

### Application release A: target reads and writes

- Deploy new DAL functions, role checks, routes, and UI terminology.
- Keep old-route redirects and narrowly scoped compatibility RPCs.
- Stop writing legacy medical organization and appointment objects.

### Migration C: cutover

- Convert `account_identities` to `platform_account_type`.
- Replace registration and invitation triggers.
- Switch billing ownership and administrative snapshots.
- Refresh the PostgREST schema cache where required.

### Application release B: compatibility removal

- Remove legacy DAL modules and medical routes from the active build.
- Remove temporary redirects after the agreed compatibility window.
- Update README, SECURITY, environment setup, seed data, and hosted tests.

### Migration D: database cleanup

- Drop compatibility RPCs, policies, views, and triggers only after dependency
  and retention checks pass.
- Remove obsolete medical tables in a separate reviewed migration. Never edit or
  delete historical migration files.

## Verification gates

Each migration/release slice must pass:

1. `npm run lint`, production build, UTF-8, translation parity, and secret tests.
2. Fresh-database migration replay and hosted development-project migration.
3. Role matrix for customer, independent provider, workshop manager, workshop
   staff, platform administrator, suspended accounts, and anonymous users.
4. RLS denial tests proving cross-provider and cross-customer isolation.
5. Hosted smoke tests for registration, login, workshop management, catalogue,
   public discovery, booking request, garage history, and billing access.
6. A database query showing no unmapped account identities or orphaned workshop
   services/bookings.

## Completion criteria

- No active route, UI copy, DAL export, RPC, policy, or new schema object uses
  `clinic`, `doctor`, `clinician`, or `patient` for an automotive concept.
- Legacy terms may exist only in immutable historical migrations, explicitly
  named compatibility objects, or isolated medical-retention tables awaiting
  approved deletion.
- `service_providers`, `workshops`, and their memberships are the authoritative
  ownership model.
- `customer_profiles` and `service_booking_requests` are the authoritative
  customer and booking models.
- A clean database can replay every historical and automotive migration in
  order, and the production application uses only the target domain model.

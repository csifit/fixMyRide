# Workshop organisation and location coverage workflow

## Canonical responsibilities

- A `service_provider` is the legal service organisation and Stripe customer.
- A `workshop` is one physical location, one public listing, and one EUR 35
  monthly billing unit.
- An organisation owner is authorized through the existing provider membership.
- A location manager is authorized through a location assignment. Each location
  must have one live primary manager before it can become publicly eligible.
- Account status is role-neutral and applies to customers, managers, staff,
  independent providers, and platform administrators.

## Invitation paths

An administrator can create a service organisation and issue an
`organisation_owner` invitation. The invitation is stored using only a SHA-256
token digest, has an expiry, and becomes terminal when accepted, revoked, or
expired.

An administrator can issue a `location_manager` invitation for a workshop
belonging to that organisation. Acceptance creates the canonical manager
profile, provider membership, location assignment, and active account identity
in one transaction. Existing active managers are assigned directly instead of
being invited again. Organisation-owner self-service invitations are the next
workflow phase.

The admin console returns a one-time, seven-day invitation URL. Only its SHA-256
digest is stored, so the administrator must copy and share the URL when it is
created. The invited person confirms the email through Supabase and then uses
the existing password-setup flow.

## Location coverage

Every workshop has a canonical `workshop_subscriptions` record. The organisation
owns one Stripe customer and billing identity, while every workshop owns one EUR
35 monthly subscription. Legacy provider subscriptions remain readable only for
the controlled migration period.

A coverage grace timestamp protects existing multi-location organisations while
they move to location subscriptions. Starting Checkout during grace creates a
trial through the grace deadline instead of an overlapping charge. New invoices
carry a workshop reference; legacy provider invoices retain a null reference.

## Publication eligibility

Migration 043 makes publication automatic and derived. A workshop appears on
the real Google map when its organisation is active, its location is not
suspended or rejected, its public name/address/city and coordinates are
complete, it has a current active primary manager with an active account, and
its location subscription is active, trialing, or inside explicit migration
grace. There is no separate administrator approval queue.

Map visibility is independent from `accepts_booking_requests`. A published
workshop may temporarily stop online requests without disappearing from public
discovery; service, scheduling, and booking RPCs continue to enforce that flag.

## Account controls

`account_identities.status` is the authoritative application control for all
platform roles. MFA-protected administrators can activate, deactivate, or block
accounts with a required reason. Changes write immutable
`platform_account_status_history` and organisation-administration audit rows.
Administrators cannot change their own status, only Superadmins can control
other administrators, and the final active Superadmin is protected. Customer,
manager, accounting, and admin route guards now enforce the status; the shared
workshop authorization function also enforces it for workshop-management RPCs.

## Step 2 admin operations

The admin providers page creates organisations and owner invitations. The
workshops page creates geocoded locations, invites a new primary or supporting
manager, and assigns an existing active manager. Customer and manager tables,
plus the security page, expose the role-neutral account control. New providers
and locations remain `pending`; publication eligibility and location-level
billing activation remain separate controlled cutovers.

## Step 3 organisation coverage

Active organisation owners have an owner-scoped coverage dashboard at
`/workshop-manager/organisation`. It shows each location, its primary manager,
canonical subscription and grace state, the EUR 35 unit price, and the total
required monthly coverage for all organisation locations. The total is a
projection only: this milestone does not create, modify, or multiply Stripe
subscriptions.

Owners can issue a seven-day invitation for a new primary or supporting manager
at one of their own locations. The application returns the plaintext link once
and stores only its SHA-256 digest. Owners can revoke an unused invitation and
issue a replacement. Registration continues through the shared invitation,
email-confirmation, and password-setup workflow introduced in Step 2. Existing
accounts still require direct administrator assignment, preventing an owner from
silently attaching an unrelated platform user by email.

## Step 4 location billing cutover

Migration 042 makes `workshop_subscriptions` the canonical Stripe subscription
state. The service organisation remains the single Stripe customer and billing
identity, while every workshop location starts an independent EUR 35 monthly
subscription. New Checkout sessions and subscription metadata carry both the
organisation and workshop identifiers; signed webhooks persist subscription and
invoice state against the workshop.

Existing active or trialing organisation subscriptions are retained as legacy
records and are never copied to a location. Each of their locations receives
grace through the later of 30 days after migration or the organisation's current
paid period end. Starting a location subscription during grace passes that
deadline to Stripe as `trial_end`, avoiding an overlapping location charge.
Owners must use the shared Stripe portal to retire the legacy organisation
subscription before grace ends. Legacy webhook events and invoices remain
supported throughout this transition, with legacy invoices retaining a null
workshop reference.

The owner billing page, platform commercial dashboard, and CSV export now report
per location. This cutover changes billing authority only; public map eligibility
remains a separate workflow milestone.

## Step 5 publication and operational access

Migration 043 makes the canonical workshop location the security boundary.
Organisation membership alone no longer grants access to every location:
catalogue, settings, hours, closures, calendar, booking management, manual
appointments, and repair lifecycle operations all resolve through a current
assignment to the exact workshop. Suspended assignments, expired assignments,
inactive manager profiles, blocked accounts, inactive organisations, and
suspended locations fail at the shared authorization boundary.

Booking and repair mutation RPCs now authorize from the booking's canonical
`workshop_id`; repair reads no longer use the retired legacy workshop-profile
mapping. This prevents a manager assigned to one location from viewing or
changing another location's customers, appointments, estimates, or repairs.

## Step 6 owner-created locations

Migration 044 lets an active service-organisation owner create a geocoded
workshop directly from `/workshop-manager/workshops`. Creating a location also
creates its default weekday hours, diagnosis service, canonical location
subscription record, and a supporting assignment for the owner, so the owner
can finish its profile and operating rules immediately.

Every new location is a separate EUR 35 billing unit and starts unpublished.
The owner must invite or assign its dedicated primary manager and activate its
location subscription before the automatic publication rules can place it on
the public map. Supporting location managers can continue to edit only the
locations to which they are explicitly assigned; they cannot create billable
locations for the organisation.

## Step 7 administrator-created location claims

Migration 046 distinguishes locations created by an administrator from legacy
and owner-created locations. A new geocoded administrator-created location
starts `active` and `unclaimed`, and appears on the public map immediately. Its
public location page offers **Claim this workshop** without exposing private
organisation or billing data. This is an explicit temporary publication
exception for administrator-curated locations, not subscription coverage.

Only an active owner of the service organisation selected by the administrator
can start the claim. The owner must first save complete organisation billing
details and then activate the EUR 35 monthly subscription for that exact
location. The claim changes to `awaiting_payment` before Checkout; only an
active or trialing location subscription received through the existing signed
Stripe webhook path finalizes it as `claimed`. Grace coverage does not complete
a claim. After claiming, the normal publication rules require a geocoded active
location, an active primary manager, active account identities, and location
billing coverage. Administrator creation therefore permits temporary map
visibility but never records or simulates a paid subscription.

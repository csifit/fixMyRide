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

Every workshop has a shadow `workshop_subscriptions` record. The existing
provider subscription remains authoritative during the expansion release. The
future billing cutover will use one Stripe customer per organisation and one
subscription per workshop at EUR 35 monthly.

An optional coverage grace timestamp supports a controlled migration for
existing multi-location organisations. It never initiates a charge. Existing
provider invoices keep a nullable workshop reference until the location billing
cutover starts writing location-owned invoices.

## Publication eligibility

The expansion migration does not change public discovery. A later cutover will
derive location publication from active organisation and account states, an
active primary manager, complete geocoded public details, and active, trialing,
or explicitly granted grace coverage. Accepting online booking requests will be
independent from map visibility.

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

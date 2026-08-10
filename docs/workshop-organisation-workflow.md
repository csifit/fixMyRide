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

An administrator or organisation owner can issue a `location_manager`
invitation for a workshop belonging to that organisation. Acceptance will create
or connect the canonical manager profile, provider membership, and location
assignment in the later workflow cutover.

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

`account_identities.status` is the future authoritative control for all platform
roles. Status changes will be performed only through audited administrative
functions that write immutable `platform_account_status_history` rows. Existing
access checks intentionally ignore the new field until that cutover is deployed.

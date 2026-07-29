# VitaPass security policy

## Fictional data only

Only clearly fictional demonstration data may be entered, seeded, tested, or
deployed with this phase. Do not use real patient information, clinical notes,
credentials, tokens, or regulated health data.

## Implemented boundaries

- Supabase Auth with cookie-based SSR sessions.
- Server identity validation with signed claims rather than untrusted session
  payloads.
- Approved-clinician checks in PostgreSQL and the centralized Data Access Layer.
- Active, unexpired, view/edit grant checks in both authorization layers.
- RLS enabled on every application table.
- No patient policy that can modify clinical tables.
- Append-only audit rows with direct insert, update, and delete denied.
- Profile views and condition-note edits use restricted database functions.
- Audit metadata is limited to identifiers, outcomes, and changed field names.
- Authenticated routes are dynamic and marked private/no-store.
- No service-role key is required or permitted in normal application requests.

## Maintainable authorization

- Each managed medical or identity table has one Superadmin RLS authorization
  path. Audit history has one read-only Superadmin policy.
- Administrator self-discovery before MFA uses a narrow caller-only function;
  it does not grant direct table access.
- Doctor profile opening and the supported note edit use small,
  purpose-specific functions with explicit identity, grant, and dual-role MFA
  checks.
- Direct doctor medical-table update policies are removed by Phase 2B.2A.
- Temporary service failures never change an application account status.
- The UI retries only after an explicit user action. Pending submissions are
  disabled and MFA requests also use an in-flight duplicate guard.

## Data-handling rules

Never put medical information, VitaPass identifiers, notes, medication data, or
patient names in:

- URLs or query strings
- application or platform logs
- analytics and monitoring events
- exception messages shown to users
- complete before/after audit records

Do not log request bodies, Server Action form data, Supabase error objects,
tokens, cookies, passwords, or authentication headers.

## Authentication audit authority

Application `sign_in` and `sign_out` audit events are supplemental,
caller-generated product events. They are restricted to identities linked to a
clinician or application administrator and are duplicate- and rate-limited.
Supabase Auth audit logs are the authoritative record for authentication
activity and must be used for security investigations.

Hosted workflow and rate-limit checks are documented in
[`docs/hosted-integration-testing.md`](docs/hosted-integration-testing.md).

## Secret handling

Commit only `.env.example`, with blank values. Store local configuration in
`.env.local` and Vercel configuration in encrypted environment settings. Browser
code may receive only the Supabase project URL and publishable key. Never expose
the service-role or secret key.

## Remaining limitations

Before production use with regulated medical information, obtain an independent
security and privacy review and add, at minimum:

- patient authentication, consent, and grant-approval workflows
- clinician onboarding, credential verification, and administrative tooling
- MFA, rate limiting, bot protection, and account recovery controls
- database integration tests against an isolated Supabase project
- audit retention, export, monitoring, and tamper-evident archival
- encryption/key-management review, backups, disaster recovery, and deletion
  procedures
- dependency remediation and continuous vulnerability/secret scanning
- legal, regulatory, data residency, vendor agreement, and incident-response
  controls appropriate to every deployment region

Report suspected vulnerabilities privately to the repository owner. Do not
include patient or credential data in a report.

# Hosted Supabase integration testing

Use only an isolated hosted Supabase development project. These checks do not
use Docker and must not be run against production or real medical data.

## Before testing

1. Confirm `.env.local` contains the development project URL and publishable
   key. Never add a service-role key.
2. Run `npx supabase db push --dry-run` and review the SQL plan.
3. Apply migration `202607290002_superadmin_foundation.sql` only after its
   separate review and explicit approval.
4. Create fictional Auth users through the Supabase Dashboard. Keep all
   credentials and Auth identifiers outside the repository.
5. Link the first Superadmin with a trusted manual SQL session. Do not expose a
   bootstrap operation through the browser or ordinary Data API.
6. Record the current values shown under **Authentication > Rate Limits**.
   Do not change them merely to make a test pass.

Use a fresh browser profile for each role. In every workflow, confirm that a
button becomes disabled while its request is pending and that one click creates
at most one resulting application event.

## Superadmin first login and MFA enrollment

1. Open `/admin/login` and enter the manually provisioned Superadmin
   credentials once.
2. Confirm VitaPass routes to `/admin/mfa/enroll`; administrative tables must
   not be visible at AAL1.
3. Select **Create authenticator setup** once. Confirm the button is disabled
   while factor discovery and enrollment are pending.
4. Scan the QR code, enter the current six-digit code, and submit once.
5. Confirm the browser reaches `/admin`, shows **MFA verified**, and displays
   the five administration sections.
6. Confirm the Supabase Auth audit log contains the authoritative
   authentication activity. The VitaPass `sign_in` event is supplementary.

If factor discovery fails, enrollment must stop at the localized security
error. Use **Try again** or sign out; do not refresh automatically.

## Superadmin login with an existing MFA factor

1. Sign out, return to `/admin/login`, and sign in once.
2. Confirm VitaPass routes to `/admin/mfa/challenge`, never to enrollment.
3. Enter an incorrect current-format code once. Confirm the invalid-code state.
4. Enter the current valid code. Confirm `/admin` opens only after AAL2.
5. Confirm a linked Superadmin identity cannot use doctor profile or edit RPCs
   at AAL1, even if that Auth identity was accidentally linked as a clinician.

## Doctor login

1. Sign out of the Superadmin session and open `/doctor/login`.
2. Sign in with a fictional approved clinician.
3. Confirm `/doctor` opens. An ordinary Auth user must see the unauthorized
   state; a pending or suspended clinician must see its own distinct state.
4. Enter incorrect credentials once and confirm the invalid-credentials
   message, not a suspension message.

## Open a patient profile

1. Give the fictional approved clinician one active, unexpired view grant.
2. Open `/doctor` and select that patient once.
3. Confirm the open control is unavailable while the request is pending.
4. Confirm the profile opens and exactly one `patient_profile_viewed`
   application audit row is created.
5. Revoke or expire the grant and retry once. Confirm the localized
   unauthorized state and no medical values in audit metadata.

## Doctor edit with a valid grant

1. Give the clinician an active, unexpired grant with both view and edit
   permission.
2. Open the patient and change only the supported chronic-condition note.
3. Select **Save signed note** once. Confirm the button stays disabled until
   completion.
4. Confirm the note changed and exactly one `patient_profile_updated` audit
   event records only safe field-name metadata.
5. Remove edit permission and retry. Confirm the database rejects the edit.

## Logout and immediate login

1. Select **Sign out** once and immediately sign in again with valid
   credentials.
2. Confirm the new session is accepted. The application audit anti-spam guard
   must not suspend or lock the user and must not override Supabase Auth.
3. For a Superadmin, complete the existing-factor MFA challenge again before
   `/admin` opens.

## Retry after a temporary API failure

1. In a local, uncommitted `.env.local`, temporarily replace the Supabase URL
   with `https://temporarily-unavailable.invalid` and restart the Next.js
   process. Do not change hosted data or account status.
2. Attempt the relevant login or protected page once.
3. Confirm the localized **temporarily unavailable** state appears. It must not
   say unauthorized or suspended and must not retry automatically.
4. Restore the real development project URL, restart Next.js, and select
   **Try again** once.
5. Confirm the same valid account works without an unlock or status change.
6. For client-side MFA discovery, browser request blocking may be used instead.
   Block the factor-list request once, confirm the fail-closed security screen,
   remove the block, and retry manually.

## Supabase Auth rate limits that affect these flows

Check the hosted project Dashboard before testing because project settings and
Supabase defaults can change. The current Supabase documentation describes:

- password sign-in/sign-up: a configurable IP-based quota; the CLI reference
  default is 30 requests per five minutes;
- MFA challenge and verification: a fixed IP-based quota documented as 15
  requests per hour;
- token refresh: 1,800 requests per hour, with bursts up to 30 requests;
- verification requests: 360 requests per hour, with bursts up to 30;
- Auth email sending: relevant to invites and recovery, not ordinary password
  login; the built-in provider has a low project-wide quota.

A Supabase Auth HTTP 429 response is **rate limited**, not invalid credentials
and not account suspension. Wait for the documented window, then retry
manually. VitaPass must not create an automatic retry loop.

The `record_auth_audit` application RPC separately suppresses the same action
within 30 seconds and accepts at most 20 caller-generated authentication events
per linked identity per hour. This protects the supplementary application log;
it does not authenticate, suspend, lock, or rate-limit Supabase Auth.

Authoritative references:

- <https://supabase.com/docs/guides/auth/rate-limits>
- <https://supabase.com/docs/guides/auth/debugging/error-codes>
- <https://supabase.com/docs/guides/auth/auth-mfa>


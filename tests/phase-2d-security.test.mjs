import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(
  new URL(
    "supabase/migrations/202607300004_clinic_organization_foundation.sql",
    root,
  ),
  "utf8",
);
const runtimeFixMigration = await readFile(
  new URL(
    "supabase/migrations/202607300005_phase_2d_runtime_fixes.sql",
    root,
  ),
  "utf8",
);
const registrationActions = await readFile(
  new URL("app/register/actions.ts", root),
  "utf8",
);
const registrationForm = await readFile(
  new URL("app/register/RegistrationForm.tsx", root),
  "utf8",
);
const confirmationRoute = await readFile(
  new URL("app/auth/confirm/route.ts", root),
  "utf8",
);
const passwordSetupAction = await readFile(
  new URL("app/register/set-password/actions.ts", root),
  "utf8",
);
const organizationActions = await readFile(
  new URL("app/organization/manage-actions.ts", root),
  "utf8",
);
const invitationForm = await readFile(
  new URL("app/organization/InvitationForm.tsx", root),
  "utf8",
);
const invitationEmail = await readFile(
  new URL("lib/email/invitation.ts", root),
  "utf8",
);
const mxrouteEmail = await readFile(
  new URL("lib/email/mxroute.ts", root),
  "utf8",
);
const organizationDal = await readFile(
  new URL("lib/dal/organization.ts", root),
  "utf8",
);

const lockedMigrations = [
  [
    "supabase/migrations/202607290001_phase_2b1_foundation.sql",
    "D60DC87BADB25C0D35894DF484B1E938D7BDA5320FB669359C8740F2E018B95B",
  ],
  [
    "supabase/migrations/202607290002_superadmin_foundation.sql",
    "1BF924E14C71FE4CEAC19DF49E62C47FD048ADF577852BBF86EF9E8EBEC6A871",
  ],
  [
    "supabase/migrations/202607300003_health_card_compatible_profile.sql",
    "F6A8DDB7CB89CE4635DB0B09673EE395C18C22AA19E0E96F3DA4F28527D25F6F",
  ],
  [
    "supabase/migrations/202607300004_clinic_organization_foundation.sql",
    "DDEC5D88C5F334BE3E8FF9BFFFE63F2046311DEF66A20263057CCFBC80E089DB",
  ],
];

test("Phase 2D preserves every applied migration byte-for-byte", async () => {
  for (const [file, expectedHash] of lockedMigrations) {
    const contents = await readFile(new URL(file, root));
    assert.equal(
      createHash("sha256").update(contents).digest("hex").toUpperCase(),
      expectedHash,
      file,
    );
  }
});

test("one immutable account type is enforced across every implemented role", () => {
  assert.match(
    migration,
    /create table public\.account_identities[\s\S]+?auth_user_id uuid primary key[\s\S]+?account_type public\.vitapass_account_type not null/i,
  );
  assert.match(
    migration,
    /having count\(distinct assignment\.account_type\) > 1/i,
  );
  assert.match(
    migration,
    /create function private\.enforce_immutable_account_type\(\)[\s\S]+?security definer[\s\S]+?An Auth identity link cannot be changed[\s\S]+?already has another VitaPass account type/i,
  );
  for (const trigger of [
    "patients_enforce_account_type",
    "clinicians_enforce_account_type",
    "administrators_enforce_account_type",
    "clinic_managers_enforce_account_type",
    "staff_enforce_account_type",
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger}`, "i"), trigger);
  }
  const browserWriteGrant = migration.match(
    /grant insert, update on table[\s\S]+?\nto authenticated;/i,
  )?.[0] ?? "";
  assert.doesNotMatch(browserWriteGrant, /public\.account_identities/i);
});

test("clinic membership and sponsorship are dated and non-overlapping", () => {
  for (const table of [
    "clinic_manager_memberships",
    "clinic_doctor_memberships",
    "clinic_sponsorship_periods",
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`, "i"));
  }
  assert.match(
    migration,
    /create function private\.prevent_overlapping_clinic_sponsorships\(\)[\s\S]+?daterange\([\s\S]+?&& daterange\(/i,
  );
  assert.match(
    migration,
    /clinic_doctor_one_live_membership_idx[\s\S]+?where status in \('invited', 'active', 'suspended'\)/i,
  );
});

test("staff is doctor-invited, doctor-scoped, and has no medical grant", () => {
  assert.match(
    migration,
    /create table public\.staff_profiles[\s\S]+?invited_by_clinician_id uuid not null/i,
  );
  assert.match(
    migration,
    /create table public\.staff_doctor_assignments[\s\S]+?staff_id uuid not null[\s\S]+?clinician_id uuid not null/i,
  );
  assert.doesNotMatch(
    migration,
    /create policy[\s\S]*?staff[\s\S]*?patient_(?:access_grants|sensitive_identifiers)/i,
  );
});

test("invitations retain only token digests and have no browser read grant", () => {
  const invitationTable = migration.match(
    /create table public\.organization_invitations[\s\S]+?\n\);/i,
  )?.[0] ?? "";
  assert.match(invitationTable, /token_digest bytea not null unique/i);
  assert.doesNotMatch(invitationTable, /raw_token|invitation_token text/i);
  const browserSelectGrant = migration.match(
    /grant select on table[\s\S]+?\nto authenticated;/i,
  )?.[0] ?? "";
  assert.doesNotMatch(
    browserSelectGrant,
    /organization_invitations/i,
  );
});

test("public registration permits three public roles and token-bound Staff", () => {
  const handler = migration.match(
    /create function private\.handle_public_account_registration\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(
    handler,
    /registration_type not in \([\s\S]+?'patient'[\s\S]+?'doctor'[\s\S]+?'clinic_manager'[\s\S]+?'staff'/i,
  );
  assert.doesNotMatch(handler, /platform_manager|platform_admin|superadmin/i);
  assert.match(handler, /invitation\.token_digest = digest\(/i);
  assert.match(handler, /invitation\.invited_email = lower\(new\.email\)/i);
  assert.match(handler, /insert into public\.clinic_sponsorship_periods/i);
  assert.match(registrationActions, /z\.literal\("staff"\)/i);
  assert.match(registrationActions, /invitationToken:\s*z\.string\(\)\.regex/i);
});

test("registration confirms email before the user chooses a password", () => {
  assert.doesNotMatch(registrationForm, /name="password"|name="confirmPassword"/i);
  assert.doesNotMatch(registrationActions, /formData\.get\("password"\)/i);
  assert.match(registrationActions, /randomBytes\(48\)\.toString\("base64url"\)/i);
  assert.match(
    registrationActions,
    /emailRedirectTo:\s*`\$\{getSiteUrl\(\)\}\/auth\/confirm`/i,
  );
  assert.match(confirmationRoute, /auth\.verifyOtp\(/i);
  assert.match(confirmationRoute, /token_hash:\s*tokenHash/i);
  assert.match(confirmationRoute, /destination\.pathname = "\/register\/set-password"/i);
  assert.match(passwordSetupAction, /auth\.updateUser\(\{\s*password:/i);
  assert.match(passwordSetupAction, /account_identities/i);
});

test("invitation and membership RPCs authorize their exact owner", () => {
  const clinicInvite = migration.match(
    /create function public\.create_clinic_doctor_invitation[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  const staffInvite = migration.match(
    /create function public\.create_doctor_staff_invitation[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  const membership = migration.match(
    /create function public\.set_clinic_doctor_membership_status[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  for (const body of [clinicInvite, staffInvite, membership]) {
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = ''/i);
    assert.match(body, /auth\.uid\(\)/i);
    assert.match(body, /insert into public\.audit_events/i);
  }
  assert.match(clinicInvite, /manager\.status = 'active'/i);
  assert.match(clinicInvite, /membership\.status = 'active'/i);
  assert.match(staffInvite, /clinician\.verification_status = 'approved'/i);
  assert.match(membership, /clinic\.status = 'active'/i);
  assert.match(membership, /clinic_sponsorship_periods/i);
  assert.match(organizationActions, /createClinicDoctorInvitation/i);
  assert.match(organizationActions, /createDoctorStaffInvitation/i);
});

test("MXroute sends localized invitations without losing the manual link", () => {
  assert.match(invitationForm, /name="language" value=\{language\}/i);
  assert.match(organizationActions, /await sendInvitationEmail\(/i);
  assert.match(organizationActions, /status:\s*emailSent \? "created" : "created_email_failed"/i);
  assert.match(organizationActions, /link,\s*\n\s*\};/i);
  assert.match(mxrouteEmail, /https:\/\/smtpapi\.mxroute\.com\//i);
  assert.match(mxrouteEmail, /AbortSignal\.timeout\(10_000\)/i);
  assert.doesNotMatch(mxrouteEmail, /setTimeout|retry/i);
  for (const language of ["en", "de", "ro", "hu"]) {
    assert.match(invitationEmail, new RegExp(`${language}:\\s*\\{`, "i"));
  }
  assert.doesNotMatch(invitationForm, /MXROUTE_PASSWORD|smtpapi/i);
});

test("organization DAL never queries patient or medical tables", () => {
  assert.doesNotMatch(
    organizationDal,
    /patients|patient_access_grants|patient_sensitive_identifiers|chronic_conditions|allergies|medications/i,
  );
});

test("billing updates recheck doctor or active clinic-manager ownership", () => {
  const billing = migration.match(
    /create function public\.update_my_billing_profile[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(billing, /security definer/i);
  assert.match(billing, /clinician\.verification_status = 'approved'/i);
  assert.match(billing, /manager\.status = 'active'/i);
  assert.match(billing, /membership\.status = 'active'/i);
  assert.match(billing, /clinic\.status = 'active'/i);
  assert.match(billing, /changed_fields/i);
  assert.doesNotMatch(billing, /safe_metadata[\s\S]+?normalized_email/i);
});

test("billing profiles have exactly one doctor or clinic owner", () => {
  assert.match(
    migration,
    /create table public\.billing_profiles[\s\S]+?\(clinic_id is not null\)::integer \+ \(clinician_id is not null\)::integer = 1/i,
  );
  assert.match(migration, /billing_profiles_clinic_idx/i);
  assert.match(migration, /billing_profiles_clinician_idx/i);
});

test("Phase 2D runtime fix backfills legacy doctor billing profiles", () => {
  assert.match(
    runtimeFixMigration,
    /insert into public\.billing_profiles \(clinician_id\)[\s\S]+?from public\.clinicians[\s\S]+?not exists/i,
  );
});

test("invitation tokens work with an empty security-definer search path", () => {
  for (const functionName of [
    "public.create_clinic_doctor_invitation",
    "public.create_doctor_staff_invitation",
    "private.handle_public_account_registration",
  ]) {
    const body = runtimeFixMigration.match(
      new RegExp(
        `create or replace function ${functionName.replaceAll(".", "\\.")}[\\s\\S]+?\\$\\$;`,
        "i",
      ),
    )?.[0] ?? "";
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = ''/i);
    assert.doesNotMatch(body, /(?<![\w.])digest\(/i);
  }
  assert.match(
    runtimeFixMigration,
    /pg_catalog\.sha256\(pg_catalog\.convert_to\(/i,
  );
  assert.doesNotMatch(runtimeFixMigration, /gen_random_bytes/i);
});

test("new organizational tables use RLS and narrow authenticated grants", () => {
  for (const table of [
    "clinic_manager_profiles",
    "staff_profiles",
    "clinics",
    "clinic_manager_memberships",
    "clinic_doctor_memberships",
    "clinic_sponsorship_periods",
    "staff_doctor_assignments",
    "organization_invitations",
    "billing_profiles",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security`, "i"),
      table,
    );
    assert.match(
      migration,
      new RegExp(`${table.replaceAll("_", ".*")}.*superadmin_manage`, "is"),
      table,
    );
  }
  assert.match(migration, /account_identities_superadmin_read/i);
  assert.doesNotMatch(
    migration,
    /grant (?:delete|truncate)[\s\S]+?to authenticated/i,
  );
});

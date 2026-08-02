import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const migrationPath = new URL(
  "supabase/migrations/202607290002_superadmin_foundation.sql",
  root,
);
const migration = await readFile(migrationPath, "utf8");
const originalMigration = await readFile(
  new URL("supabase/migrations/202607290001_phase_2b1_foundation.sql", root),
);
const authzSource = await readFile(new URL("lib/authz.ts", root), "utf8");
const adminAuthSource = await readFile(
  new URL("lib/dal/admin-auth.ts", root),
  "utf8",
);
const enrollmentSource = await readFile(
  new URL("app/admin/mfa/MfaEnrollmentClient.tsx", root),
  "utf8",
);
const challengePageSource = await readFile(
  new URL("app/admin/mfa/challenge/page.tsx", root),
  "utf8",
);
const challengeClientSource = await readFile(
  new URL("app/admin/mfa/challenge/MfaChallengeClient.tsx", root),
  "utf8",
);
const authErrorsSource = await readFile(
  new URL("lib/auth-errors.ts", root),
  "utf8",
);
const doctorPortalSource = await readFile(
  new URL("app/doctor/DoctorPortalClient.tsx", root),
  "utf8",
);
const pendingSubmitSource = await readFile(
  new URL("app/PendingSubmitButton.tsx", root),
  "utf8",
);
const dashboardSource = await readFile(
  new URL("app/admin/AdminDashboardClient.tsx", root),
  "utf8",
);
const adminValueSource = await readFile(
  new URL("app/i18n/admin-values.ts", root),
  "utf8",
);
const compiled = ts.transpileModule(authzSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const authz = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const compiledAuthErrors = ts.transpileModule(authErrorsSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const authErrors = await import(
  `data:text/javascript;base64,${Buffer.from(compiledAuthErrors).toString("base64")}`
);

test("the already-applied Phase 2B.1 migration is unchanged", () => {
  assert.equal(
    createHash("sha256").update(originalMigration).digest("hex"),
    "d60dc87badb25c0d35894df484b1e938d7bda5320fb669359c8740f2e018b95b",
  );
});

test("ordinary users and doctors cannot access admin routes", () => {
  assert.equal(
    authz.classifyAdminAccess({ authenticatedUserId: "ordinary-user" }),
    "unauthorized",
  );
  assert.equal(
    authz.classifyAdminAccess({ authenticatedUserId: "doctor-user" }),
    "unauthorized",
  );
});

test("inactive administrators are denied", () => {
  assert.equal(
    authz.classifyAdminAccess({
      authenticatedUserId: "admin-user",
      administratorAuthUserId: "admin-user",
      role: "superadmin",
      status: "suspended",
      assuranceLevel: "aal2",
    }),
    "suspended",
  );
});

test("active superadmins require aal2", () => {
  const base = {
    authenticatedUserId: "admin-user",
    administratorAuthUserId: "admin-user",
    role: "superadmin",
    status: "active",
  };
  assert.equal(
    authz.classifyAdminAccess({ ...base, assuranceLevel: "aal1" }),
    "mfa_required",
  );
  assert.equal(
    authz.classifyAdminAccess({ ...base, assuranceLevel: "aal2" }),
    "authorized",
  );
});

test("MFA factor discovery fails closed and enrolls only after confirmed absence", () => {
  assert.equal(
    authz.classifyAdminMfaDiscovery({ lookupSucceeded: false }),
    "security_error",
  );
  assert.equal(
    authz.classifyAdminMfaDiscovery({
      lookupSucceeded: true,
      verifiedTotpCount: 0,
    }),
    "enrollment_required",
  );
  assert.equal(
    authz.classifyAdminMfaDiscovery({
      lookupSucceeded: true,
      verifiedTotpCount: 1,
    }),
    "challenge_required",
  );
});

test("server MFA lookup errors render security error instead of enrollment", () => {
  assert.match(adminAuthSource, /if \(state === "security_error"\)/);
  assert.match(adminAuthSource, /return \{ state \} as const/);
  assert.doesNotMatch(
    adminAuthSource,
    /if \(error\) return "\/admin\/mfa\/enroll"/,
  );
  assert.match(challengePageSource, /mfa\.state === "security_error"/);
  assert.match(
    challengePageSource,
    /AdminAccessStatusScreen status="securityError"/,
  );
  assert.doesNotMatch(challengePageSource, /error[^;\n]+redirect\([^)]*enroll/i);
});

test("client enrollment stops on lookup errors and existing verified TOTP", () => {
  const lookup = enrollmentSource.indexOf("listFactors()");
  const failClosed = enrollmentSource.indexOf(
    'discovery === "security_error"',
  );
  const existingFactor = enrollmentSource.indexOf(
    'discovery === "challenge_required"',
  );
  const enroll = enrollmentSource.indexOf("mfa.enroll({");
  assert.ok(lookup >= 0);
  assert.ok(failClosed > lookup && failClosed < enroll);
  assert.ok(existingFactor > lookup && existingFactor < enroll);
  assert.match(enrollmentSource, /setSecurityError\(true\);\s+return;/);
  assert.match(enrollmentSource, /router\.replace\(`\/admin\/mfa\/challenge\?next=/);
});

test("MFA enrollment uses the VitaPass issuer and never localhost", () => {
  const enrollmentCall = enrollmentSource.match(
    /supabase\.auth\.mfa\.enroll\(\{[\s\S]+?\}\)/,
  )?.[0] ?? "";
  assert.match(enrollmentCall, /issuer:\s*"VitaPass"/);
  assert.match(enrollmentCall, /friendlyName:\s*"VitaPass privileged account"/);
  assert.doesNotMatch(enrollmentCall, /localhost(?::\d+)?/i);
});

test("MFA submissions are single-flight, pending-disabled, and never auto-retry", () => {
  for (const source of [enrollmentSource, challengeClientSource]) {
    assert.match(source, /requestInFlight\.current/);
    assert.match(source, /if \(requestInFlight\.current\) return/);
    assert.match(source, /disabled=\{pending\}/);
    assert.doesNotMatch(source, /setTimeout|setInterval/);
  }
});

test("authentication errors distinguish credentials, rate limits, and outages", () => {
  assert.equal(
    authErrors.classifyLoginError({ code: "invalid_credentials", status: 400 }),
    "invalid_credentials",
  );
  assert.equal(
    authErrors.classifyLoginError({
      code: "over_request_rate_limit",
      status: 429,
    }),
    "rate_limited",
  );
  assert.equal(
    authErrors.classifyLoginError({
      name: "AuthRetryableFetchError",
      status: 0,
    }),
    "unavailable",
  );
  assert.equal(
    authErrors.classifyMfaError({ code: "mfa_verification_failed", status: 422 }),
    "invalid_code",
  );
});

test("profile opening and form submissions cannot be duplicated while pending", () => {
  assert.match(doctorPortalSource, /profileRequestInFlight = useRef\(false\)/);
  assert.match(
    doctorPortalSource,
    /if \(!patient\.databaseId \|\| profileRequestInFlight\.current\) return/,
  );
  assert.match(doctorPortalSource, /disabled=\{openingPatientId !== null\}/);
  assert.match(pendingSubmitSource, /useFormStatus\(\)/);
  assert.match(pendingSubmitSource, /disabled=\{disabled \|\| pending\}/);
});

test("administrator identity uses auth uid and never email comparison", () => {
  assert.match(
    migration,
    /auth_user_id uuid not null unique references auth\.users\(id\)/i,
  );
  assert.match(migration, /auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /auth\.jwt\(\)[^;\n]*email|email\s*=/i);
  const discovery = migration.match(
    /create function public\.get_my_administrator_identity\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(discovery, /security definer/i);
  assert.match(discovery, /set search_path = ''/i);
  assert.match(discovery, /auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(
    migration,
    /grant execute on function public\.get_my_administrator_identity\(\)\s+to authenticated/i,
  );
  assert.doesNotMatch(migration, /administrators_read_self/i);
});

test("private security definer authorization requires aal2 and has narrow grants", () => {
  const functionBody = migration.match(
    /create function private\.is_active_superadmin\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(functionBody, /security definer/i);
  assert.match(functionBody, /set search_path = ''/i);
  assert.match(functionBody, /auth\.jwt\(\)->>'aal'\) = 'aal2'/i);
  assert.match(functionBody, /role = 'superadmin'/i);
  assert.match(functionBody, /status = 'active'/i);
  assert.doesNotMatch(migration, /create function public\.is_active_superadmin/i);
  assert.match(
    migration,
    /revoke all on function private\.is_active_superadmin\(\)[\s\S]+?from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function private\.is_active_superadmin\(\) to authenticated/i,
  );
});

test("every privileged doctor definer path has the dual-role aal2 guard", () => {
  const guard = migration.match(
    /create function private\.administrator_mfa_allows_privileged_operation\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(guard, /security definer/i);
  assert.match(guard, /set search_path = ''/i);
  assert.match(guard, /from public\.application_administrators/i);
  assert.match(guard, /auth_user_id = \(select auth\.uid\(\)\)/i);
  assert.match(guard, /auth\.jwt\(\)->>'aal'\) = 'aal2'/i);

  for (const signature of [
    "current_clinician_id\\(\\)",
    "has_patient_access\\([\\s\\S]*?\\)",
    "get_patient_profile\\([\\s\\S]*?\\)",
    "update_chronic_condition_note\\([\\s\\S]*?\\)",
  ]) {
    const body = migration.match(
      new RegExp(
        `create or replace function public\\.${signature}[\\s\\S]+?\\$\\$;`,
        "i",
      ),
    )?.[0] ?? "";
    assert.match(
      body,
      /private\.administrator_mfa_allows_privileged_operation\(\)/i,
      signature,
    );
    assert.match(body, /security definer/i, signature);
    assert.match(body, /set search_path = ''/i, signature);
  }
  assert.doesNotMatch(
    migration,
    /grant execute\s+on function private\.administrator_mfa_allows_privileged_operation\(\)\s+to authenticated/i,
  );
});

test("superadmin RLS covers all required tables and audit remains read-only", () => {
  for (const table of [
    "application_administrators",
    "clinicians",
    "patients",
    "allergies",
    "medications",
    "chronic_conditions",
    "surgeries",
    "implants_and_devices",
    "emergency_contacts",
    "patient_access_grants",
    "audit_events",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `create policy [^\\n]+[\\s\\S]{0,100}?on public\\.${table}`,
        "i",
      ),
      table,
    );
  }
  assert.match(
    migration,
    /create policy audit_superadmin_read[\s\S]+?for select to authenticated/i,
  );
  assert.doesNotMatch(migration, /\bas restrictive\b/i);
  for (const [policy, table] of [
    ["clinicians_superadmin_manage", "clinicians"],
    ["patients_superadmin_manage", "patients"],
    ["allergies_superadmin_manage", "allergies"],
    ["medications_superadmin_manage", "medications"],
    ["conditions_superadmin_manage", "chronic_conditions"],
    ["surgeries_superadmin_manage", "surgeries"],
    ["implants_superadmin_manage", "implants_and_devices"],
    ["contacts_superadmin_manage", "emergency_contacts"],
    ["grants_superadmin_manage", "patient_access_grants"],
  ]) {
    const matches = migration.match(
      new RegExp(
        `create policy ${policy}\\s+on public\\.${table}\\s+for all to authenticated`,
        "gi",
      ),
    ) ?? [];
    assert.equal(matches.length, 1, policy);
  }
  for (const oldPolicy of [
    "allergies_edit_clinician",
    "medications_edit_clinician",
    "conditions_edit_clinician",
    "surgeries_edit_clinician",
    "implants_edit_clinician",
    "contacts_edit_clinician",
  ]) {
    assert.match(
      migration,
      new RegExp(`drop policy ${oldPolicy} on public\\.`),
      oldPolicy,
    );
  }
  assert.doesNotMatch(
    migration,
    /create policy audit_superadmin_[^\n]+[\s\S]{0,100}?for (?:insert|update|delete)/i,
  );
  assert.match(
    migration,
    /revoke insert, update, delete, truncate[\s\S]+?public\.audit_events from anon, authenticated/i,
  );
});

test("browser and Data API callers cannot promote themselves", () => {
  for (const policy of [
    "administrators_superadmin_create",
    "administrators_superadmin_update",
  ]) {
    const body = migration.match(
      new RegExp(`create policy ${policy}[\\s\\S]+?;`, "i"),
    )?.[0] ?? "";
    assert.match(body, /private\.is_active_superadmin\(\)/i);
    assert.match(body, /auth_user_id <> \(select auth\.uid\(\)\)/i);
  }
  assert.doesNotMatch(
    migration,
    /create policy [^\n]+ on public\.application_administrators[\s\S]{0,160}?for delete/i,
  );
});

test("superadmin mutations are audited without medical values", () => {
  const auditFunction = migration.match(
    /create function private\.audit_superadmin_mutation\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(auditFunction, /administrator\.role = 'superadmin'/i);
  assert.match(auditFunction, /administrator\.status = 'active'/i);
  assert.match(
    auditFunction,
    /auth\.jwt\(\)->>'aal'\) is distinct from 'aal2'/i,
  );
  for (const trigger of [
    "application_administrators_superadmin_audit",
    "clinicians_superadmin_audit",
    "patients_superadmin_audit",
    "allergies_superadmin_audit",
    "medications_superadmin_audit",
    "conditions_superadmin_audit",
    "surgeries_superadmin_audit",
    "implants_superadmin_audit",
    "contacts_superadmin_audit",
  ]) {
    assert.match(migration, new RegExp(`create trigger ${trigger}`, "i"), trigger);
  }
  for (const action of [
    "administrator_created",
    "administrator_updated",
    "administrator_suspended",
    "clinician_created",
    "clinician_updated",
    "clinician_approved",
    "clinician_suspended",
    "patient_created",
    "patient_updated",
    "patient_archived",
    "medical_record_created",
    "medical_record_updated",
    "access_grant_created",
    "access_grant_updated",
    "access_grant_approved",
    "access_grant_revoked",
  ]) {
    assert.equal(migration.includes(`'${action}'`), true, action);
  }
  const metadata = [
    ...migration.matchAll(/safe_metadata[\s\S]{0,220}?(\{[^;]*\})/gi),
  ]
    .map((match) => match[1])
    .join("\n")
    .toLowerCase();
  for (const forbidden of [
    "clinical_note",
    "medication_name",
    "password",
    "token",
    "secret",
    "before_record",
    "after_record",
  ]) {
    assert.equal(metadata.includes(forbidden), false, forbidden);
  }
});

test("doctors and patients use lifecycle states instead of hard deletion", () => {
  assert.match(migration, /alter table public\.patients[\s\S]+archived_at/i);
  assert.match(
    migration,
    /revoke delete, truncate[\s\S]+?public\.clinicians[\s\S]+?public\.patients/i,
  );
  assert.doesNotMatch(
    migration,
    /create policy [^\n]+ on public\.(?:clinicians|patients)[\s\S]{0,120}?for delete/i,
  );
});

test("authentication audit accepts only linked identities and resists spam", () => {
  const body = migration.match(
    /create or replace function public\.record_auth_audit\([\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(
    body,
    /if clinician_id is null and administrator_id is null then\s+raise insufficient_privilege/i,
  );
  assert.match(body, /pg_advisory_xact_lock/i);
  assert.match(body, /event\.action = auth_action/i);
  assert.match(body, /interval '30 seconds'/i);
  assert.match(body, /recent_event_count >= 20/i);
  assert.match(body, /interval '1 hour'/i);
  assert.match(
    migration,
    /Supabase Auth audit logs are authoritative for authentication activity/i,
  );
});

test("database enums and audit codes are rendered only through translation maps", () => {
  for (const mapper of [
    "administratorRoleKey",
    "administratorStatusKey",
    "clinicianStatusKey",
  ]) {
    assert.match(
      dashboardSource,
      new RegExp(`t\\(${mapper}\\((?:row|doctor|history|clinic)\\.`),
      mapper,
    );
  }
  assert.doesNotMatch(
    dashboardSource,
    /\[(?:[^\]]*,\s*)?row\.(?:role|status|action|resourceType)(?:,|\])/,
  );
  assert.doesNotMatch(dashboardSource, /admin\.nav\.(?:grants|audit)/);
  for (const rawValue of [
    "superadmin",
    "admin",
    "active",
    "suspended",
    "pending",
    "approved",
    "rejected",
    "revoked",
    "expired",
    "sign_in",
    "patient_profile_viewed",
    "administrator_created",
    "medical_record_updated",
    "auth_session",
    "patient_access_grants",
  ]) {
    assert.match(
      adminValueSource,
      new RegExp(`${rawValue}:\\s*"[^"]+"`),
      rawValue,
    );
  }
  assert.match(adminValueSource, /admin\.value\.unknown/);
});

test("new admin files contain no committed identity or credential values", async () => {
  const files = [
    migrationPath,
    new URL("app/admin/actions.ts", root),
    new URL("app/admin/login/AdminLoginForm.tsx", root),
    new URL("app/admin/mfa/MfaEnrollmentClient.tsx", root),
    new URL("lib/dal/admin-auth.ts", root),
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
      file.pathname,
    );
    assert.doesNotMatch(
      source,
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
      file.pathname,
    );
    assert.doesNotMatch(
      source,
      /(?:password|token|secret)\s*[:=]\s*["'][^"']+["']/i,
      file.pathname,
    );
    assert.doesNotMatch(
      source,
      /SUPABASE_SERVICE_ROLE|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\./,
      file.pathname,
    );
  }
});

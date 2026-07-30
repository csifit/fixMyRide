import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(
  new URL(
    "supabase/migrations/202607300003_health_card_compatible_profile.sql",
    root,
  ),
  "utf8",
);
const migration001 = await readFile(
  new URL("supabase/migrations/202607290001_phase_2b1_foundation.sql", root),
);
const migration002 = await readFile(
  new URL("supabase/migrations/202607290002_superadmin_foundation.sql", root),
);
const previousAuthorization = migration002.toString("utf8");
const doctorPortal = await readFile(
  new URL("app/doctor/DoctorPortalClient.tsx", root),
  "utf8",
);
const doctorActions = await readFile(
  new URL("app/doctor/actions.ts", root),
  "utf8",
);
const doctorDal = await readFile(
  new URL("lib/dal/doctor.ts", root),
  "utf8",
);
const databaseErrors = await readFile(
  new URL("lib/dal/errors.ts", root),
  "utf8",
);
const patientPortal = await readFile(
  new URL("app/PatientPortalClient.tsx", root),
  "utf8",
);
const demoData = await readFile(new URL("app/demo-data.ts", root), "utf8");
const seed = await readFile(new URL("supabase/seed.sql", root), "utf8");
const adminValueMap = await readFile(
  new URL("app/i18n/admin-values.ts", root),
  "utf8",
);
const catalogs = Object.fromEntries(
  await Promise.all(
    ["en", "de", "ro", "hu"].map(async (language) => [
      language,
      JSON.parse(
        await readFile(new URL(`app/i18n/${language}.json`, root), "utf8"),
      ),
    ]),
  ),
);

function functionBody(name) {
  return (
    migration.match(
      new RegExp(
        `create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\([\\s\\S]+?\\$\\$;`,
        "i",
      ),
    )?.[0] ?? ""
  );
}

test("Phase 2C preserves both reviewed migrations byte-for-byte", () => {
  assert.equal(
    createHash("sha256").update(migration001).digest("hex"),
    "d60dc87badb25c0d35894df484b1e938d7bda5320fb669359c8740f2e018b95b",
  );
  assert.equal(
    createHash("sha256").update(migration002).digest("hex"),
    "1bf924e14c71fe4ceac19df49e62c47fd048adf577852bbf86ef9e8ebec6a871",
  );
});

test("health-card-compatible non-sensitive profile fields retain full_name", () => {
  assert.match(migration, /alter table public\.patients/i);
  for (const column of [
    "family_name",
    "given_names",
    "insurance_status",
    "insurance_verification_source",
    "insurance_verified_at",
    "insurance_house_code",
    "insurance_house_name",
    "family_doctor_name",
    "family_doctor_professional_code",
    "family_doctor_telephone",
    "profile_verified_by_clinician_id",
    "profile_verified_by_administrator_id",
    "profile_verified_at",
  ]) {
    assert.match(migration, new RegExp(`add column ${column}\\b`, "i"), column);
  }
  assert.doesNotMatch(migration, /drop column full_name|rename column full_name/i);
});

test("sensitive identifiers are isolated with no direct browser policy or grant", () => {
  const table = migration.match(
    /create table public\.patient_sensitive_identifiers[\s\S]+?\n\);/i,
  )?.[0] ?? "";
  assert.match(table, /\bcnp text/i);
  assert.match(table, /\binsurance_number text/i);
  assert.match(table, /\bhealth_card_number text/i);
  assert.match(table, /\bhealth_card_expires_at date/i);
  assert.match(table, /\bverified_by_administrator_id uuid/i);
  assert.match(
    migration,
    /alter table public\.patient_sensitive_identifiers enable row level security/i,
  );
  assert.doesNotMatch(
    migration,
    /create policy [^\n]+[\s\S]{0,120}?on public\.patient_sensitive_identifiers/i,
  );
  assert.match(
    migration,
    /revoke all on table public\.patient_sensitive_identifiers\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:select|insert|update|delete)[\s\S]{0,100}?public\.patient_sensitive_identifiers/i,
  );
});

test("sensitive RPC authorization is one explicit AAL2-or-editable-grant path", () => {
  const guard = functionBody(
    "private.can_manage_patient_health_data",
  );
  assert.match(guard, /security definer/i);
  assert.match(guard, /set search_path = ''/i);
  assert.match(guard, /private\.is_active_superadmin\(\)/i);
  assert.match(guard, /public\.current_clinician_id\(\) is not null/i);
  assert.match(
    guard,
    /public\.has_patient_access\(requested_patient_id, true\)/i,
  );
  assert.match(
    migration,
    /revoke all on function private\.can_manage_patient_health_data\(uuid\)\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function private\.can_manage_patient_health_data/i,
  );
});

test("every Phase 2C RPC normalizes dual-linked identities to one actor", () => {
  const resolver = functionBody("private.resolve_patient_health_actor");
  assert.match(resolver, /security definer/i);
  assert.match(resolver, /set search_path = ''/i);
  assert.match(resolver, /administrator\.role = 'superadmin'/i);
  assert.match(resolver, /administrator\.status = 'active'/i);
  assert.match(resolver, /auth\.jwt\(\)->>'aal'\) = 'aal2'/i);
  assert.match(
    resolver,
    /when active_administrator\.id is not null then null[\s\S]+?else public\.current_clinician_id\(\)/i,
  );
  assert.match(
    migration,
    /revoke all on function private\.resolve_patient_health_actor\(\)\s+from public, anon, authenticated/i,
  );

  for (const name of [
    "public.read_patient_sensitive_identifiers",
    "public.update_patient_sensitive_identifiers",
    "public.update_patient_health_card_profile",
    "public.create_life_threatening_diagnosis",
    "public.update_life_threatening_diagnosis",
    "public.deactivate_life_threatening_diagnosis",
    "public.reactivate_life_threatening_diagnosis",
    "public.reactivate_life_threatening_diagnosis",
    "public.get_patient_profile",
  ]) {
    assert.match(
      functionBody(name),
      /private\.resolve_patient_health_actor\(\)/i,
      name,
    );
  }

  for (const name of [
    "public.create_life_threatening_diagnosis",
    "public.update_life_threatening_diagnosis",
    "public.deactivate_life_threatening_diagnosis",
    "public.reactivate_life_threatening_diagnosis",
    "public.reactivate_life_threatening_diagnosis",
  ]) {
    const body = functionBody(name);
    assert.match(body, /verified_by_clinician_id/i, name);
    assert.match(body, /verified_by_administrator_id/i, name);
    assert.match(
      body,
      /(?:clinician_id,\s*administrator_id,\s*now\(\)|verified_by_clinician_id\s*=\s*clinician_id,[\s\S]+?verified_by_administrator_id\s*=\s*administrator_id,[\s\S]+?verified_at\s*=\s*now\(\))/i,
      name,
    );
    assert.match(
      body,
      /auth\.uid\(\) is null[\s\S]+?private\.can_manage_patient_health_data/i,
      name,
    );
  }

  const diagnosisTable = migration.match(
    /create table public\.life_threatening_diagnoses[\s\S]+?\n\);/i,
  )?.[0] ?? "";
  assert.match(
    diagnosisTable,
    /\(verified_by_clinician_id is not null\)::integer[\s\S]+?\(verified_by_administrator_id is not null\)::integer\s*=\s*1/i,
  );
  const sensitiveTable = migration.match(
    /create table public\.patient_sensitive_identifiers[\s\S]+?\n\);/i,
  )?.[0] ?? "";
  assert.match(
    sensitiveTable,
    /\(verified_by_clinician_id is not null\)::integer[\s\S]+?\(verified_by_administrator_id is not null\)::integer[\s\S]+?=\s*\(verified_at is not null\)::integer/i,
  );
});

test("sensitive read and update RPCs are fixed-path, narrow and audited", () => {
  for (const name of [
    "public.read_patient_sensitive_identifiers",
    "public.update_patient_sensitive_identifiers",
  ]) {
    const body = functionBody(name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path = ''/i, name);
    assert.match(
      body,
      /private\.can_manage_patient_health_data/i,
      name,
    );
  }
  assert.match(
    functionBody("public.read_patient_sensitive_identifiers"),
    /'sensitive_identifiers_viewed'/i,
  );
  assert.match(
    functionBody("public.read_patient_sensitive_identifiers"),
    /'verified_by_name', verifier_name[\s\S]+?'verified_by_code', verifier_code/i,
  );
  const update = functionBody("public.update_patient_sensitive_identifiers");
  assert.match(update, /returns void/i);
  assert.match(update, /'sensitive_identifiers_updated'/i);
  assert.match(update, /is distinct from normalized_cnp/i);
  assert.match(
    update,
    /insurance_number[\s\S]+?is distinct from normalized_insurance_number/i,
  );
  assert.match(
    update,
    /health_card_number[\s\S]+?is distinct from normalized_health_card_number/i,
  );
  assert.match(update, /cardinality\(changed_fields\) = 0/i);
  assert.match(update, /no identifier fields changed/i);
  assert.match(update, /jsonb_build_object\('changed_fields', changed_fields\)/i);
  assert.doesNotMatch(
    update.match(/insert into public\.audit_events[\s\S]+?\);/i)?.[0] ?? "",
    /\bnew_(?:cnp|insurance_number|health_card_number)\b/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.read_patient_sensitive_identifiers\(uuid, uuid\)\s+to authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.update_patient_sensitive_identifiers\([\s\S]+?\) to authenticated/i,
  );
});

test("ordinary patient profile explicitly excludes sensitive identifiers", () => {
  const profile = functionBody("public.get_patient_profile");
  assert.match(profile, /'patient', jsonb_build_object\(/i);
  assert.doesNotMatch(profile, /to_jsonb\(patient_row\)/i);
  assert.doesNotMatch(
    profile,
    /patient_sensitive_identifiers|'cnp'|'insurance_number'|'health_card_number'/i,
  );
  assert.match(profile, /'emergency_contacts'/i);
  assert.match(profile, /limit 2/i);
  assert.match(profile, /'life_threatening_diagnoses'/i);
});

test("life-threatening diagnoses support coded, clinician-verified records", () => {
  assert.match(
    migration,
    /create type public\.medical_code_system as enum\s+\('icd10', 'snomed_ct', 'other'\)/i,
  );
  const table = migration.match(
    /create table public\.life_threatening_diagnoses[\s\S]+?\n\);/i,
  )?.[0] ?? "";
  assert.match(table, /diagnosis_code text not null/i);
  assert.match(table, /verified_by_clinician_id uuid/i);
  assert.match(table, /verified_by_administrator_id uuid/i);
  assert.match(table, /verified_at timestamptz not null/i);
  assert.match(
    migration,
    /create policy life_threatening_diagnoses_superadmin_read[\s\S]+?for select/i,
  );
  assert.match(
    migration,
    /revoke insert, update, delete, truncate\s+on table public\.life_threatening_diagnoses\s+from anon, authenticated/i,
  );
  assert.doesNotMatch(migration, /\bas restrictive\b/i);
});

test("diagnosis deactivation is reversible, audited, and no-op safe", () => {
  const deactivate = functionBody(
    "public.deactivate_life_threatening_diagnosis",
  );
  const reactivate = functionBody(
    "public.reactivate_life_threatening_diagnosis",
  );
  assert.match(deactivate, /if not diagnosis_row\.is_active/i);
  assert.match(deactivate, /diagnosis is already inactive/i);
  assert.match(deactivate, /is_active = false/i);
  assert.match(reactivate, /if diagnosis_row\.is_active/i);
  assert.match(reactivate, /diagnosis is already active/i);
  assert.match(reactivate, /is_active = true/i);
  for (const body of [deactivate, reactivate]) {
    assert.match(body, /insert into public\.audit_events/i);
    assert.match(body, /changed_fields[\s\S]+?is_active/i);
  }
  assert.match(
    migration,
    /create unique index life_threatening_diagnoses_active_identity_idx[\s\S]+?where is_active/i,
  );
  const activeDiagnosisIdentity = migration.match(
    /create unique index life_threatening_diagnoses_active_identity_idx[\s\S]+?where is_active/i,
  )?.[0] ?? "";
  assert.doesNotMatch(activeDiagnosisIdentity, /diagnosis_name/i);
  assert.match(activeDiagnosisIdentity, /code_system/i);
  assert.match(activeDiagnosisIdentity, /lower\(diagnosis_code\)/i);
  assert.match(
    activeDiagnosisIdentity,
    /coalesce\(lower\(code_system_other_name\), ''\)/i,
  );

  const profile = functionBody("public.get_patient_profile");
  assert.match(
    profile,
    /'life_threatening_diagnoses'[\s\S]+?and diagnosis\.is_active/i,
  );
  assert.match(profile, /'inactive_life_threatening_diagnoses'/i);
  assert.match(
    profile,
    /when private\.can_manage_patient_health_data\(patient_row\.id\)[\s\S]+?and not diagnosis\.is_active/i,
  );
});

test("every Phase 2C write RPC rechecks the same authorization boundary", () => {
  const writeFunctions = [
    "public.update_patient_health_card_profile",
    "public.update_patient_sensitive_identifiers",
    "public.create_life_threatening_diagnosis",
    "public.update_life_threatening_diagnosis",
    "public.deactivate_life_threatening_diagnosis",
    "public.reactivate_life_threatening_diagnosis",
  ];
  for (const name of writeFunctions) {
    const body = functionBody(name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path = ''/i, name);
    assert.match(body, /auth\.uid\(\) is null/i, name);
    assert.match(body, /private\.can_manage_patient_health_data\(/i, name);
  }

  const guard = functionBody("private.can_manage_patient_health_data");
  assert.match(guard, /private\.is_active_superadmin\(\)/i);
  assert.match(guard, /has_patient_access\(requested_patient_id, true\)/i);

  const activeSuperadmin = previousAuthorization.match(
    /create function private\.is_active_superadmin\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(activeSuperadmin, /auth\.jwt\(\)->>'aal'\) = 'aal2'/i);
  assert.match(activeSuperadmin, /role = 'superadmin'/i);
  assert.match(activeSuperadmin, /status = 'active'/i);

  const clinician = previousAuthorization.match(
    /create or replace function public\.current_clinician_id\(\)[\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(clinician, /verification_status = 'approved'/i);
  const grant = previousAuthorization.match(
    /create or replace function public\.has_patient_access\([\s\S]+?\$\$;/i,
  )?.[0] ?? "";
  assert.match(grant, /grant_row\.status = 'active'/i);
  assert.match(grant, /not require_edit or grant_row\.can_edit/i);
  assert.match(grant, /grant_row\.revoked_at is null/i);
  assert.match(grant, /grant_row\.expires_at is null or grant_row\.expires_at > now\(\)/i);
});

test("insurance status cannot contradict its verification state", () => {
  assert.match(
    migration,
    /insurance_verification_source as enum\s+\('not_verified', 'cnas_manual_check', 'cnas_official_integration'/i,
  );
  assert.doesNotMatch(migration, /'cnas'(?:\s|,|\))/i);
  const constraint = migration.match(
    /add constraint patients_insurance_verification_check check \([\s\S]+?\n  \),/i,
  )?.[0] ?? "";
  assert.match(
    constraint,
    /insurance_status in \('unknown', 'verification_pending'\)[\s\S]+?insurance_verification_source = 'not_verified'[\s\S]+?insurance_verified_at is null/i,
  );
  assert.match(
    constraint,
    /insurance_status in \('insured', 'uninsured'\)[\s\S]+?insurance_verification_source not in \([\s\S]+?'not_verified'[\s\S]+?'cnas_official_integration'[\s\S]+?insurance_verified_at is not null/i,
  );
  const update = functionBody("public.update_patient_health_card_profile");
  assert.match(update, /new_insurance_status in \('insured', 'uninsured'\)/i);
  assert.match(update, /new_insurance_status in \('unknown', 'verification_pending'\)/i);
  assert.match(update, /'cnas_official_integration'/i);
  assert.match(
    update,
    /when new_insurance_status in \('unknown', 'verification_pending'\)\s+then null/i,
  );
  assert.match(
    update,
    /patient_row\.insurance_status is not distinct from new_insurance_status[\s\S]+?then patient_row\.insurance_verified_at[\s\S]+?else now\(\)/i,
  );
  assert.doesNotMatch(update, /\bnew_insurance_verified_at\b/i);
  assert.doesNotMatch(doctorPortal, /datetime-local|insuranceVerifiedAt"/i);
  assert.doesNotMatch(doctorActions, /formData\.get\("insuranceVerifiedAt"\)/i);
  assert.doesNotMatch(doctorDal, /new_insurance_verified_at/i);
  assert.doesNotMatch(doctorPortal, /cnas_official_integration/i);
  assert.doesNotMatch(doctorActions, /cnas_official_integration/i);
  assert.match(doctorPortal, /cnas_manual_check/i);
  assert.match(
    catalogs.en["doctor.health.insurance.source.cnas_manual_check"],
    /manual CNAS check performed by the clinician/i,
  );
});

test("new write audits contain changed field names and no submitted values", () => {
  for (const name of [
    "public.update_patient_health_card_profile",
    "public.update_patient_sensitive_identifiers",
    "public.create_life_threatening_diagnosis",
    "public.update_life_threatening_diagnosis",
    "public.deactivate_life_threatening_diagnosis",
  ]) {
    const body = functionBody(name);
    assert.match(body, /changed_fields/i, name);
    assert.match(body, /insert into public\.audit_events/i, name);
    const auditInsert =
      body.match(/insert into public\.audit_events[\s\S]+?\);/i)?.[0] ?? "";
    assert.doesNotMatch(
      auditInsert,
      /\bnew_(?:cnp|insurance_number|health_card_number|diagnosis_name|diagnosis_code)\b/i,
      name,
    );
  }
});

test("patients receive no direct clinician-certified write policy", () => {
  assert.doesNotMatch(
    migration,
    /create policy [^\n]+[\s\S]{0,120}?on public\.(?:patients|life_threatening_diagnoses|patient_sensitive_identifiers)[\s\S]{0,120}?(?:auth_user_id\s*=\s*\(select auth\.uid\(\)\)|\bto patient\b)/i,
  );
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update)[\s\S]{0,100}?public\.(?:patient_sensitive_identifiers|life_threatening_diagnoses)/i,
  );
});

test("sensitive UI is masked, explicit, transient and single-flight", () => {
  assert.match(
    doctorPortal,
    /selected\.canEdit && selected\.databaseId && <SensitiveIdentifiersSection/,
  );
  assert.match(doctorPortal, /"••••••••"/);
  assert.match(doctorPortal, /readSensitiveIdentifiersAction/);
  assert.match(doctorPortal, /requestInFlight\.current/);
  assert.match(doctorPortal, /disabled=\{pending\}/);
  assert.match(doctorPortal, /setIdentifiers\(null\)/);
  assert.doesNotMatch(
    doctorPortal,
    /localStorage|sessionStorage|indexedDB|document\.cookie/i,
  );
});

test("all new doctor write forms are pending-disabled and single-flight", () => {
  for (const component of [
    "HealthCardProfileForm",
    "SensitiveIdentifiersSection",
    "DiagnosisCreateForm",
    "DiagnosisMutationForm",
  ]) {
    assert.match(doctorPortal, new RegExp(`function ${component}\\(`), component);
  }
  assert.match(doctorPortal, /function useSingleFlightSubmit\(/);
  assert.match(doctorPortal, /requestInFlight\.current/);
  assert.ok(
    (doctorPortal.match(
      /disabled=\{(?:pending|updatePending|deactivatePending|reactivatePending)\}/g,
    ) ?? [])
      .length >= 4,
  );
  for (const action of [
    "updateHealthCardProfileAction",
    "updateSensitiveIdentifiersAction",
    "createLifeThreateningDiagnosisAction",
    "updateLifeThreateningDiagnosisAction",
    "deactivateLifeThreateningDiagnosisAction",
    "reactivateLifeThreateningDiagnosisAction",
  ]) {
    assert.match(doctorPortal, new RegExp(action), action);
  }
});

test("doctor mutations refresh current patient data and lifecycle forms are safe", () => {
  assert.match(
    doctorPortal,
    /const \[selectedPatientId, setSelectedPatientId\] = useState/i,
  );
  assert.match(
    doctorPortal,
    /patients\.find\(\(patient\) => patient\.id === selectedPatientId\)/i,
  );
  assert.doesNotMatch(
    doctorPortal,
    /const \[selected, setSelected\] = useState<Patient/i,
  );
  assert.match(doctorPortal, /function useRefreshingMutation\(/i);
  assert.match(doctorPortal, /router\.refresh\(\)/i);
  assert.match(doctorPortal, /formRef\.current\?\.reset\(\)/i);
  assert.match(doctorPortal, /selected\.databaseId}:\$\{selected\.lastReview/i);
  assert.match(doctorPortal, /diagnosis\.id}:\$\{diagnosis\.verifiedAt/i);
  assert.match(
    doctorPortal,
    /name="confirmed" value="yes" required/i,
  );
  assert.match(
    doctorActions,
    /confirmed:\s*z\.literal\("yes"\)/i,
  );
  assert.match(doctorPortal, /inactiveLifeThreateningDiagnoses/i);
  assert.match(doctorPortal, /doctor\.health\.diagnosis\.historyTitle/i);
  assert.match(doctorPortal, /doctor\.health\.diagnosis\.reactivate/i);
  assert.match(doctorPortal, /useSingleFlightSubmit\(/i);
});

test("duplicate active diagnoses receive a localized conflict response", () => {
  assert.match(
    databaseErrors,
    /error\.code === "23505"\) return "conflict"/i,
  );
  assert.match(
    doctorActions,
    /error\.code === "conflict"\) return \{ status: "duplicate" \}/i,
  );
  for (const catalog of Object.values(catalogs)) {
    assert.ok(catalog["doctor.health.form.duplicate"]);
  }
});

test("life-threatening diagnosis audit resource is localized centrally", () => {
  assert.match(
    adminValueMap,
    /life_threatening_diagnoses:\s*"admin\.audit\.resource\.lifeThreateningDiagnoses"/i,
  );
  for (const language of ["en", "de", "ro", "hu"]) {
    assert.equal(
      typeof catalogs[language][
        "admin.audit.resource.lifeThreateningDiagnoses"
      ],
      "string",
      language,
    );
  }
});

test("sharing and seed data explicitly exclude protected identifiers", () => {
  assert.match(patientPortal, /patient\.share\.sensitiveExcluded/);
  assert.match(patientPortal, /emergencyContacts\.slice\(0, 2\)/);
  for (const source of [patientPortal, demoData, seed]) {
    assert.doesNotMatch(
      source,
      /\.(?:cnp|insuranceNumber|healthCardNumber)\b|insurance_number|health_card_number/i,
    );
  }
});

test("all four languages contain actual Phase 2C translations", () => {
  const keys = [
    "patient.share.sensitiveExcluded",
    "doctor.health.identity.title",
    "doctor.health.insurance.status.insured",
    "doctor.health.lifeThreatening.title",
    "doctor.health.insurance.source.cnas_manual_check",
    "doctor.health.diagnosis.deactivateConfirmation",
    "doctor.health.diagnosis.reactivate",
    "doctor.health.diagnosis.historyTitle",
    "doctor.health.diagnosis.historyDescription",
    "doctor.health.sensitive.reveal",
    "admin.audit.action.sensitiveIdentifiersViewed",
    "admin.audit.resource.lifeThreateningDiagnoses",
  ];
  for (const key of keys) {
    for (const language of ["en", "de", "ro", "hu"]) {
      assert.equal(typeof catalogs[language][key], "string", `${language}:${key}`);
      assert.ok(catalogs[language][key].trim().length > 0, `${language}:${key}`);
    }
    for (const language of ["de", "ro", "hu"]) {
      assert.notEqual(catalogs[language][key], catalogs.en[key], `${language}:${key}`);
    }
  }
});

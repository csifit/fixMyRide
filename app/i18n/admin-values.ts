import type { TranslationKey } from ".";

const administratorRoleKeys: Record<string, TranslationKey> = {
  superadmin: "admin.role.superadmin",
  admin: "admin.role.admin",
  manager: "admin.role.manager",
};

const administratorStatusKeys: Record<string, TranslationKey> = {
  active: "admin.status.active",
  suspended: "admin.status.suspended",
};

const clinicianStatusKeys: Record<string, TranslationKey> = {
  pending: "admin.status.pending",
  approved: "admin.status.approved",
  suspended: "admin.status.suspended",
  rejected: "admin.status.rejected",
};

const grantStatusKeys: Record<string, TranslationKey> = {
  pending: "admin.status.pending",
  active: "admin.status.active",
  revoked: "admin.status.revoked",
  expired: "admin.status.expired",
};

const auditActionKeys: Record<string, TranslationKey> = {
  sign_in: "admin.audit.action.signIn",
  sign_out: "admin.audit.action.signOut",
  access_denied: "admin.audit.action.accessDenied",
  patient_profile_viewed: "admin.audit.action.patientProfileViewed",
  patient_profile_updated: "admin.audit.action.patientProfileUpdated",
  access_grant_created: "admin.audit.action.accessGrantCreated",
  access_grant_approved: "admin.audit.action.accessGrantApproved",
  access_grant_revoked: "admin.audit.action.accessGrantRevoked",
  access_grant_updated: "admin.audit.action.accessGrantUpdated",
  administrator_created: "admin.audit.action.administratorCreated",
  administrator_updated: "admin.audit.action.administratorUpdated",
  administrator_suspended: "admin.audit.action.administratorSuspended",
  clinician_created: "admin.audit.action.clinicianCreated",
  clinician_updated: "admin.audit.action.clinicianUpdated",
  clinician_approved: "admin.audit.action.clinicianApproved",
  clinician_suspended: "admin.audit.action.clinicianSuspended",
  patient_created: "admin.audit.action.patientCreated",
  patient_updated: "admin.audit.action.patientUpdated",
  patient_archived: "admin.audit.action.patientArchived",
  medical_record_created: "admin.audit.action.medicalRecordCreated",
  medical_record_updated: "admin.audit.action.medicalRecordUpdated",
  sensitive_identifiers_viewed:
    "admin.audit.action.sensitiveIdentifiersViewed",
  sensitive_identifiers_updated:
    "admin.audit.action.sensitiveIdentifiersUpdated",
};

const auditResourceKeys: Record<string, TranslationKey> = {
  auth_session: "admin.audit.resource.authSession",
  patient_profile: "admin.audit.resource.patientProfile",
  access_grant: "admin.audit.resource.accessGrant",
  chronic_condition: "admin.audit.resource.chronicCondition",
  application_administrators: "admin.audit.resource.administrators",
  clinicians: "admin.audit.resource.clinicians",
  patients: "admin.audit.resource.patients",
  allergies: "admin.audit.resource.allergies",
  medications: "admin.audit.resource.medications",
  chronic_conditions: "admin.audit.resource.chronicConditions",
  surgeries: "admin.audit.resource.surgeries",
  implants_and_devices: "admin.audit.resource.implants",
  emergency_contacts: "admin.audit.resource.emergencyContacts",
  patient_access_grants: "admin.audit.resource.accessGrants",
  patient_sensitive_identifiers:
    "admin.audit.resource.sensitiveIdentifiers",
  life_threatening_diagnoses:
    "admin.audit.resource.lifeThreateningDiagnoses",
  health_card_profile: "admin.audit.resource.healthCardProfile",
};

const clinicianSpecialtyKeys: Record<string, TranslationKey> = {
  familyMedicine: "medical.specialty.familyMedicine",
};

const unknownKey: TranslationKey = "admin.value.unknown";

export const administratorRoleKey = (value: string) =>
  administratorRoleKeys[value] ?? unknownKey;
export const administratorStatusKey = (value: string) =>
  administratorStatusKeys[value] ?? unknownKey;
export const clinicianStatusKey = (value: string) =>
  clinicianStatusKeys[value] ?? unknownKey;
export const grantStatusKey = (value: string) =>
  grantStatusKeys[value] ?? unknownKey;
export const auditActionKey = (value: string) =>
  auditActionKeys[value] ?? unknownKey;
export const auditResourceKey = (value: string) =>
  auditResourceKeys[value] ?? unknownKey;
export const clinicianSpecialtyKey = (value: string) =>
  clinicianSpecialtyKeys[value] ?? unknownKey;

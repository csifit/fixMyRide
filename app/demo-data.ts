export type SexKey = "female" | "male";
export type AllergyKey = "penicillin" | "latex" | "ibuprofen" | "noneKnown";
export type ConditionKey =
  | "type2Diabetes"
  | "hypertension"
  | "atrialFibrillation"
  | "asthma"
  | "hyperlipidemia"
  | "hypothyroidism";
export type ScheduleKey = "twiceDaily" | "everyMorning" | "asPrescribed";
export type PatientStatusKey = "upToDate" | "reviewDue" | "newUpdate";

export type PatientPortalData = {
  profile: {
    name: string; initials: string; dateOfBirth: string; blood: string;
    sexKey: SexKey; organDonor: boolean; allergyKeys: AllergyKey[];
    medications: { name: string; dose: string; scheduleKey: ScheduleKey }[];
    conditionKeys: ConditionKey[];
    procedures: { key: "appendectomy"; year: number }[];
    implantKeys: "none"[];
    emergencyContact: { name: string; relationshipKey: "husband"; phone: string };
    doctor: { name: string; phone: string };
    lastUpdated: string;
  };
  accessHistory: {
    id: string; initials: string; actor: string;
    contextKey: "clinicQr" | "clinicianNfc" | "personalSession";
    occurredAt: string; actionKey: "viewed" | "edited";
  }[];
};

export type DoctorPatientSummary = {
  id: string; initials: string; name: string; age: number; sexKey: SexKey;
  lastReview: string; statusKey: PatientStatusKey; conditionKeys: ConditionKey[];
  allergyKeys: AllergyKey[]; medications: { name: string; dose: string }[];
  access: { kind: "familyCareTeam" } | { kind: "temporary"; days: number };
};

export type DoctorAccessRequest = {
  id: string; initials: string; name: string;
  reasonKey: "medicationReconciliation" | "newPatientConsultation" | "followUpCare";
  receivedAt: string; urgencyKey: "urgent" | "routine";
};

export type DoctorPortalData = {
  referenceTime: string;
  clinician: { name: string; initials: string; specialtyKey: "familyMedicine"; clinicName: string; clinicCountry: string };
  metrics: { patientCount: number; pendingRequestCount: number; urgentRequestCount: number; reviewedLastThirtyDays: number };
  patients: DoctorPatientSummary[];
  requests: DoctorAccessRequest[];
  activity: { id: string; occurredAt: string; name: string; actionKey: "reviewedUpdate" | "requestReceived" | "openedProfile" | "signedMedicationUpdate"; typeKey: "clinicalReview" | "access" | "profileView" | "signedUpdate" }[];
};

export const patientPortalData: PatientPortalData = {
  profile: {
    name: "Elena Varga", initials: "EV", dateOfBirth: "1987-02-14", blood: "A+",
    sexKey: "female", organDonor: true, allergyKeys: ["penicillin", "latex"],
    medications: [
      { name: "Metformin", dose: "500 mg", scheduleKey: "twiceDaily" },
      { name: "Lisinopril", dose: "10 mg", scheduleKey: "everyMorning" },
    ],
    conditionKeys: ["type2Diabetes", "hypertension"],
    procedures: [{ key: "appendectomy", year: 2009 }],
    implantKeys: ["none"],
    emergencyContact: { name: "Márton Varga", relationshipKey: "husband", phone: "+40 721 555 014" },
    doctor: { name: "Dr. Ana Popescu", phone: "+40 21 555 0182" },
    lastUpdated: "2026-07-24T10:42:00+03:00",
  },
  accessHistory: [
    { id: "event-1", initials: "AP", actor: "Dr. Ana Popescu", contextKey: "clinicQr", occurredAt: "2026-07-24T10:42:00+03:00", actionKey: "edited" },
    { id: "event-2", initials: "SM", actor: "St. Maria Emergency Department", contextKey: "clinicianNfc", occurredAt: "2026-06-11T21:17:00+03:00", actionKey: "viewed" },
    { id: "event-3", initials: "EV", actor: "Elena Varga", contextKey: "personalSession", occurredAt: "2026-06-09T08:03:00+03:00", actionKey: "viewed" },
  ],
};

const doctorPatients: DoctorPatientSummary[] = [
  { id: "VP-2048-1193", initials: "EV", name: "Elena Varga", age: 39, sexKey: "female", lastReview: "2026-07-24", statusKey: "newUpdate", conditionKeys: ["type2Diabetes", "hypertension"], allergyKeys: ["penicillin", "latex"], medications: [{ name: "Metformin", dose: "500 mg" }, { name: "Lisinopril", dose: "10 mg" }], access: { kind: "familyCareTeam" } },
  { id: "VP-7812-4406", initials: "AM", name: "Andrei Munteanu", age: 67, sexKey: "male", lastReview: "2026-07-22", statusKey: "reviewDue", conditionKeys: ["atrialFibrillation"], allergyKeys: ["noneKnown"], medications: [{ name: "Apixaban", dose: "5 mg" }, { name: "Bisoprolol", dose: "2.5 mg" }], access: { kind: "temporary", days: 11 } },
  { id: "VP-3901-7724", initials: "SC", name: "Sofia Cristea", age: 28, sexKey: "female", lastReview: "2026-07-18", statusKey: "upToDate", conditionKeys: ["asthma"], allergyKeys: ["ibuprofen"], medications: [{ name: "Budesonide inhaler", dose: "" }], access: { kind: "familyCareTeam" } },
  { id: "VP-6620-0915", initials: "NP", name: "Nicolae Pavel", age: 54, sexKey: "male", lastReview: "2026-07-09", statusKey: "upToDate", conditionKeys: ["hyperlipidemia"], allergyKeys: ["noneKnown"], medications: [{ name: "Atorvastatin", dose: "20 mg" }], access: { kind: "familyCareTeam" } },
  { id: "VP-1139-8250", initials: "DI", name: "Daria Ionescu", age: 42, sexKey: "female", lastReview: "2026-07-02", statusKey: "reviewDue", conditionKeys: ["hypothyroidism"], allergyKeys: ["noneKnown"], medications: [{ name: "Levothyroxine", dose: "75 mcg" }], access: { kind: "temporary", days: 4 } },
];

export const doctorPortalData: DoctorPortalData = {
  referenceTime: "2026-07-29T12:00:00+03:00",
  clinician: { name: "Dr. Ana Popescu", initials: "AP", specialtyKey: "familyMedicine", clinicName: "Bucharest Family Clinic", clinicCountry: "RO" },
  metrics: { patientCount: doctorPatients.length, pendingRequestCount: 3, urgentRequestCount: 1, reviewedLastThirtyDays: 24 },
  patients: doctorPatients,
  requests: [
    { id: "request-1", initials: "MR", name: "Mihai Radu", reasonKey: "medicationReconciliation", receivedAt: "2026-07-29T11:52:00+03:00", urgencyKey: "urgent" },
    { id: "request-2", initials: "LB", name: "Luca Barbu", reasonKey: "newPatientConsultation", receivedAt: "2026-07-29T11:24:00+03:00", urgencyKey: "routine" },
    { id: "request-3", initials: "IM", name: "Ioana Marin", reasonKey: "followUpCare", receivedAt: "2026-07-29T11:00:00+03:00", urgencyKey: "routine" },
  ],
  activity: [
    { id: "activity-1", occurredAt: "2026-07-29T10:42:00+03:00", name: "Elena Varga", actionKey: "reviewedUpdate", typeKey: "clinicalReview" },
    { id: "activity-2", occurredAt: "2026-07-29T09:18:00+03:00", name: "Mihai Radu", actionKey: "requestReceived", typeKey: "access" },
    { id: "activity-3", occurredAt: "2026-07-28T16:05:00+03:00", name: "Andrei Munteanu", actionKey: "openedProfile", typeKey: "profileView" },
    { id: "activity-4", occurredAt: "2026-07-27T11:31:00+03:00", name: "Sofia Cristea", actionKey: "signedMedicationUpdate", typeKey: "signedUpdate" },
  ],
};

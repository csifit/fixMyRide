export type PatientPortalData = {
  profile: {
    name: string;
    initials: string;
    dob: string;
    blood: string;
    sex: string;
    donor: string;
    allergies: string[];
    medications: { name: string; dose: string; timing: string }[];
    chronic: string[];
    surgeries: string[];
    implants: string[];
    emergency: string;
    emergencyPhone: string;
    doctor: string;
    doctorPhone: string;
    lastUpdated: string;
  };
  accessHistory: {
    id: string;
    initials: string;
    actor: string;
    context: string;
    occurredAt: string;
    action: string;
  }[];
};

export type DoctorPatientSummary = {
  id: string;
  initials: string;
  name: string;
  age: number;
  gender: string;
  lastReview: string;
  status: "Up to date" | "Review due" | "New update";
  conditions: string[];
  allergies: string[];
  medications: string[];
  access: string;
};

export type DoctorAccessRequest = {
  id: string;
  initials: string;
  name: string;
  reason: string;
  received: string;
  urgency: "Urgent" | "Routine";
};

export type DoctorPortalData = {
  clinician: {
    name: string;
    initials: string;
    specialty: string;
    clinicName: string;
    clinicCountry: string;
  };
  metrics: {
    patientCount: number;
    pendingRequestCount: number;
    urgentRequestCount: number;
    reviewedLastThirtyDays: number;
  };
  patients: DoctorPatientSummary[];
  requests: DoctorAccessRequest[];
  activity: {
    id: string;
    time: string;
    name: string;
    action: string;
    type: string;
  }[];
};

export const patientPortalData: PatientPortalData = {
  profile: {
    name: "Elena Varga",
    initials: "EV",
    dob: "14 February 1987",
    blood: "A+",
    sex: "Female",
    donor: "Yes",
    allergies: ["Penicillin", "Latex"],
    medications: [
      { name: "Metformin", dose: "500 mg", timing: "Twice daily" },
      { name: "Lisinopril", dose: "10 mg", timing: "Every morning" },
    ],
    chronic: ["Type 2 diabetes", "Hypertension"],
    surgeries: ["Appendectomy · 2009"],
    implants: ["No implants or medical devices"],
    emergency: "Márton Varga · Husband",
    emergencyPhone: "+40 721 555 014",
    doctor: "Dr. Ana Popescu",
    doctorPhone: "+40 21 555 0182",
    lastUpdated: "24 July 2026",
  },
  accessHistory: [
    {
      id: "event-1",
      initials: "AP",
      actor: "Dr. Ana Popescu",
      context: "Bucharest Family Clinic · QR access",
      occurredAt: "24 July 2026 · 10:42",
      action: "Edited",
    },
    {
      id: "event-2",
      initials: "SM",
      actor: "St. Maria Emergency Department",
      context: "Verified clinician · NFC access",
      occurredAt: "11 June 2026 · 21:17",
      action: "Viewed",
    },
    {
      id: "event-3",
      initials: "EV",
      actor: "You",
      context: "Personal device · Secure session",
      occurredAt: "9 June 2026 · 08:03",
      action: "Viewed",
    },
  ],
};

const doctorPatients: DoctorPatientSummary[] = [
  {
    id: "VP-2048-1193",
    initials: "EV",
    name: "Elena Varga",
    age: 39,
    gender: "Female",
    lastReview: "24 Jul 2026",
    status: "New update",
    conditions: ["Type 2 diabetes", "Hypertension"],
    allergies: ["Penicillin", "Latex"],
    medications: ["Metformin 500 mg", "Lisinopril 10 mg"],
    access: "Family care team",
  },
  {
    id: "VP-7812-4406",
    initials: "AM",
    name: "Andrei Munteanu",
    age: 67,
    gender: "Male",
    lastReview: "22 Jul 2026",
    status: "Review due",
    conditions: ["Atrial fibrillation"],
    allergies: ["No known allergies"],
    medications: ["Apixaban 5 mg", "Bisoprolol 2.5 mg"],
    access: "Temporary access · 11 days left",
  },
  {
    id: "VP-3901-7724",
    initials: "SC",
    name: "Sofia Cristea",
    age: 28,
    gender: "Female",
    lastReview: "18 Jul 2026",
    status: "Up to date",
    conditions: ["Asthma"],
    allergies: ["Ibuprofen"],
    medications: ["Budesonide inhaler"],
    access: "Family care team",
  },
  {
    id: "VP-6620-0915",
    initials: "NP",
    name: "Nicolae Pavel",
    age: 54,
    gender: "Male",
    lastReview: "09 Jul 2026",
    status: "Up to date",
    conditions: ["Hyperlipidemia"],
    allergies: ["No known allergies"],
    medications: ["Atorvastatin 20 mg"],
    access: "Family care team",
  },
  {
    id: "VP-1139-8250",
    initials: "DI",
    name: "Daria Ionescu",
    age: 42,
    gender: "Female",
    lastReview: "02 Jul 2026",
    status: "Review due",
    conditions: ["Hypothyroidism"],
    allergies: ["No known allergies"],
    medications: ["Levothyroxine 75 mcg"],
    access: "Temporary access · 4 days left",
  },
];

export const doctorPortalData: DoctorPortalData = {
  clinician: {
    name: "Dr. Ana Popescu",
    initials: "AP",
    specialty: "Family medicine",
    clinicName: "Bucharest Family Clinic",
    clinicCountry: "RO",
  },
  metrics: {
    patientCount: doctorPatients.length,
    pendingRequestCount: 3,
    urgentRequestCount: 1,
    reviewedLastThirtyDays: 24,
  },
  patients: doctorPatients,
  requests: [
    {
      id: "request-1",
      initials: "MR",
      name: "Mihai Radu",
      reason: "Medication reconciliation",
      received: "8 min ago",
      urgency: "Urgent",
    },
    {
      id: "request-2",
      initials: "LB",
      name: "Luca Barbu",
      reason: "New patient consultation",
      received: "36 min ago",
      urgency: "Routine",
    },
    {
      id: "request-3",
      initials: "IM",
      name: "Ioana Marin",
      reason: "Follow-up care",
      received: "1 hr ago",
      urgency: "Routine",
    },
  ],
  activity: [
    {
      id: "activity-1",
      time: "Today, 10:42",
      name: "Elena Varga",
      action: "Reviewed patient-submitted profile update",
      type: "Clinical review",
    },
    {
      id: "activity-2",
      time: "Today, 09:18",
      name: "Mihai Radu",
      action: "Access request received",
      type: "Access",
    },
    {
      id: "activity-3",
      time: "Yesterday, 16:05",
      name: "Andrei Munteanu",
      action: "Opened medical profile for consultation",
      type: "Profile view",
    },
    {
      id: "activity-4",
      time: "27 Jul, 11:31",
      name: "Sofia Cristea",
      action: "Signed medication update",
      type: "Signed update",
    },
  ],
};

-- Fictional development data only. This file never creates an Auth user or password.
-- After creating a doctor in Supabase Auth, link that user's UUID as documented in README.

insert into public.clinicians (
  id, auth_user_id, full_name, specialty, clinic_name, clinic_country,
  professional_identifier, verification_status
) values (
  '10000000-0000-4000-8000-000000000001', null, 'Dr. Mira Novak',
  'familyMedicine', 'Northstar Family Clinic', 'RO',
  'DEMO-CLINICIAN-0001', 'approved'
);

insert into public.patients (
  id, vitapass_id, full_name, date_of_birth, blood_group, rh_factor, sex,
  organ_donor, family_doctor_id
) values
  ('20000000-0000-4000-8000-000000000001', 'VP-4102-7301', 'Elena Dobre', '1987-02-14', 'A', 'positive', 'female', true, '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'VP-5820-1146', 'Andrei Luca', '1959-05-03', 'O', 'positive', 'male', false, '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000003', 'VP-9304-2281', 'Sofia Marin', '1998-11-21', 'B', 'negative', 'female', null, '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000004', 'VP-7411-3902', 'Nicolae Petrescu', '1972-09-08', 'AB', 'positive', 'male', false, '10000000-0000-4000-8000-000000000001');

insert into public.patient_access_grants (
  id, patient_id, clinician_id, status, can_view, can_edit, granted_at,
  expires_at, revoked_at
) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active', true, true, now() - interval '30 days', now() + interval '90 days', null),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'pending', true, false, null, null, null),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'active', true, false, now() - interval '14 days', now() + interval '30 days', null),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'revoked', true, false, now() - interval '60 days', null, now() - interval '10 days');

insert into public.allergies (patient_id, allergen_key, allergen_name, status) values
  ('20000000-0000-4000-8000-000000000001', 'penicillin', 'Penicillin', 'active'),
  ('20000000-0000-4000-8000-000000000001', 'latex', 'Latex', 'active'),
  ('20000000-0000-4000-8000-000000000003', 'ibuprofen', 'Ibuprofen', 'active');

insert into public.medications (
  patient_id, medication_name, dosage, schedule_key, status, started_at
) values
  ('20000000-0000-4000-8000-000000000001', 'Metformin', '500 mg', 'twiceDaily', 'active', '2021-03-10'),
  ('20000000-0000-4000-8000-000000000001', 'Lisinopril', '10 mg', 'everyMorning', 'active', '2022-08-17'),
  ('20000000-0000-4000-8000-000000000003', 'Budesonide inhaler', '200 mcg', 'asPrescribed', 'active', '2020-06-05');

insert into public.chronic_conditions (
  id, patient_id, condition_key, condition_name, clinical_note, status, diagnosed_at
) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'type2Diabetes', 'Type 2 diabetes mellitus', 'Fictional demonstration note.', 'active', '2021-03-10'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'hypertension', 'Hypertension', null, 'active', '2022-08-17'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'asthma', 'Asthma', null, 'active', '2010-05-16');

insert into public.surgeries (
  patient_id, procedure_key, procedure_name, procedure_date
) values (
  '20000000-0000-4000-8000-000000000001', 'appendectomy', 'Appendectomy', '2009-04-12'
);

insert into public.emergency_contacts (
  patient_id, full_name, relationship_key, phone_number, priority
) values (
  '20000000-0000-4000-8000-000000000001', 'Mihai Dobre', 'husband',
  '+40 700 000 101', 1
);

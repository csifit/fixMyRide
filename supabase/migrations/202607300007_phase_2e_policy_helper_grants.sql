begin;

-- These security-definer helpers remain private and return only booleans.
-- Authenticated callers need EXECUTE because PostgreSQL evaluates them from RLS.
grant execute on function private.can_manage_doctor_appointments(uuid)
  to authenticated;
grant execute on function private.staff_has_patient_access(uuid)
  to authenticated;

commit;

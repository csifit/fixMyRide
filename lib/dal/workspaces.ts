import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type DoctorWorkspace = {
  clinicianId: string;
  fullName: string;
  specialty: string;
  professionalBio: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  yearsExperience: number | null;
  spokenLanguages: string[];
  acceptsNewPatients: boolean;
  sponsoredClinicId: string | null;
  clinicName: string;
  clinicCountry: string;
  city: string | null;
  practiceAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  isIndependent: boolean;
  canEditWorkspace: boolean;
  canEditBilling: boolean;
};

export type ClinicWorkspace = {
  id: string;
  legalName: string;
  displayName: string;
  countryCode: string;
  status: string;
  description: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

export async function loadDoctorWorkspace(): Promise<DoctorWorkspace | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_doctor_workspace").maybeSingle();
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    clinicianId: row.clinician_id as string,
    fullName: row.full_name as string,
    specialty: row.specialty as string,
    professionalBio: row.professional_bio as string | null,
    publicPhone: row.public_phone as string | null,
    publicEmail: row.public_email as string | null,
    yearsExperience: nullableNumber(row.years_experience),
    spokenLanguages: Array.isArray(row.spoken_languages) ? row.spoken_languages as string[] : [],
    acceptsNewPatients: Boolean(row.accepts_new_patients),
    sponsoredClinicId: row.sponsored_clinic_id as string | null,
    clinicName: row.clinic_name as string,
    clinicCountry: row.clinic_country as string,
    city: row.city as string | null,
    practiceAddress: row.practice_address as string | null,
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
    isIndependent: Boolean(row.is_independent),
    canEditWorkspace: Boolean(row.can_edit_workspace),
    canEditBilling: Boolean(row.can_edit_billing),
  };
}

export async function updateDoctorProfile(input: {
  professionalBio: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  yearsExperience: number | null;
  spokenLanguages: string[];
  acceptsNewPatients: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_doctor_profile", {
    new_professional_bio: input.professionalBio,
    new_public_phone: input.publicPhone,
    new_public_email: input.publicEmail,
    new_years_experience: input.yearsExperience,
    new_spoken_languages: input.spokenLanguages,
    new_accepts_new_patients: input.acceptsNewPatients,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function updateIndependentWorkspace(input: {
  clinicName: string;
  clinicCountry: string;
  city: string | null;
  practiceAddress: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_independent_workspace", {
    new_clinic_name: input.clinicName,
    new_clinic_country: input.clinicCountry,
    new_city: input.city,
    new_practice_address: input.practiceAddress,
    new_latitude: input.latitude,
    new_longitude: input.longitude,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedClinicWorkspaces(managerId: string): Promise<ClinicWorkspace[]> {
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("clinic_manager_memberships")
    .select("clinic_id")
    .eq("clinic_manager_id", managerId)
    .eq("status", "active");
  if (membershipError) throw new DataAccessError(classifyDatabaseError(membershipError));
  const ids = (memberships ?? []).map((row) => row.clinic_id);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("clinics")
    .select("id, legal_name, display_name, country_code, status, description, public_phone, public_email, city, address, latitude, longitude")
    .in("id", ids)
    .order("display_name");
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return (data ?? []).map((row) => ({
    id: row.id,
    legalName: row.legal_name,
    displayName: row.display_name,
    countryCode: row.country_code,
    status: row.status,
    description: row.description,
    publicPhone: row.public_phone,
    publicEmail: row.public_email,
    city: row.city,
    address: row.address,
    latitude: nullableNumber(row.latitude),
    longitude: nullableNumber(row.longitude),
  }));
}

export async function createManagedClinic(input: { legalName: string; displayName: string; countryCode: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_managed_clinic", {
    new_legal_name: input.legalName,
    new_display_name: input.displayName,
    new_country_code: input.countryCode,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return data as string;
}

export async function updateManagedClinic(input: Omit<ClinicWorkspace, "status">) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_clinic", {
    requested_clinic_id: input.id,
    new_legal_name: input.legalName,
    new_display_name: input.displayName,
    new_country_code: input.countryCode,
    new_description: input.description,
    new_public_phone: input.publicPhone,
    new_public_email: input.publicEmail,
    new_city: input.city,
    new_address: input.address,
    new_latitude: input.latitude,
    new_longitude: input.longitude,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

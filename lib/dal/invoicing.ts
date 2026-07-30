import "server-only";

import { createClient } from "../supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type BillingProfile = {
  legalName: string | null;
  fiscalIdentifier: string | null;
  vatIdentifier: string | null;
  tradeRegisterNumber: string | null;
  billingAddress: string | null;
  billingCountry: string | null;
  billingEmail: string | null;
  billingContact: string | null;
  status: string;
};

type BillingRow = {
  legal_name: string | null;
  fiscal_identifier: string | null;
  vat_identifier: string | null;
  trade_register_number: string | null;
  billing_address: string | null;
  billing_country: string | null;
  billing_email: string | null;
  billing_contact: string | null;
  status: string;
};

function mapBilling(row: BillingRow): BillingProfile {
  return {
    legalName: row.legal_name,
    fiscalIdentifier: row.fiscal_identifier,
    vatIdentifier: row.vat_identifier,
    tradeRegisterNumber: row.trade_register_number,
    billingAddress: row.billing_address,
    billingCountry: row.billing_country,
    billingEmail: row.billing_email,
    billingContact: row.billing_contact,
    status: row.status,
  };
}

function emptyBilling(): BillingProfile {
  return {
    legalName: null,
    fiscalIdentifier: null,
    vatIdentifier: null,
    tradeRegisterNumber: null,
    billingAddress: null,
    billingCountry: "RO",
    billingEmail: null,
    billingContact: null,
    status: "incomplete",
  };
}

export async function loadDoctorBilling(clinicianId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_profiles")
    .select("legal_name, fiscal_identifier, vat_identifier, trade_register_number, billing_address, billing_country, billing_email, billing_contact, status")
    .eq("clinician_id", clinicianId)
    .maybeSingle();
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (!data) return emptyBilling();
  return mapBilling(data as BillingRow);
}

export async function loadClinicBilling(clinicId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_profiles")
    .select("legal_name, fiscal_identifier, vat_identifier, trade_register_number, billing_address, billing_country, billing_email, billing_contact, status")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  if (!data) return emptyBilling();
  return mapBilling(data as BillingRow);
}

export async function updateMyBilling(
  clinicId: string | null,
  profile: Omit<BillingProfile, "status">,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_billing_profile", {
    requested_clinic_id: clinicId,
    new_legal_name: profile.legalName,
    new_fiscal_identifier: profile.fiscalIdentifier,
    new_vat_identifier: profile.vatIdentifier,
    new_trade_register_number: profile.tradeRegisterNumber,
    new_billing_address: profile.billingAddress,
    new_billing_country: profile.billingCountry,
    new_billing_email: profile.billingEmail,
    new_billing_contact: profile.billingContact,
    request_correlation_id: crypto.randomUUID(),
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

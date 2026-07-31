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

export type ClinicBillingUsage = {
  month: string;
  status: "open" | "closed";
  clinicianId: string;
  clinicianName: string;
  subscriptionCents: number;
  smsCount: number;
  smsUnitCents: number;
  totalCents: number;
};

export type PlatformBillingUsage = {
  month: string;
  payerKind: "doctor" | "clinic";
  payerId: string;
  payerName: string;
  doctorCount: number;
  smsCount: number;
  totalCents: number;
};

export type BillingRate = { effectiveMonth: string; subscriptionCents: number; smsUnitCents: number };

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

export async function loadClinicBillingUsage(clinicId: string, months = 6): Promise<ClinicBillingUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_clinic_billing_usage", {
    requested_clinic_id: clinicId,
    requested_months: months,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return (data ?? []).map((row: Record<string, unknown>) => ({
    month: row.usage_month as string,
    status: row.statement_status as "open" | "closed",
    clinicianId: row.clinician_id as string,
    clinicianName: row.clinician_name as string,
    subscriptionCents: Number(row.subscription_cents),
    smsCount: Number(row.sms_count),
    smsUnitCents: Number(row.sms_unit_cents),
    totalCents: Number(row.total_cents),
  }));
}

export async function loadPlatformBillingUsage(months = 6): Promise<PlatformBillingUsage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_platform_billing_usage", {
    requested_months: months,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return (data ?? []).map((row: Record<string, unknown>) => ({
    month: row.usage_month as string,
    payerKind: row.payer_kind as "doctor" | "clinic",
    payerId: row.payer_id as string,
    payerName: row.payer_name as string,
    doctorCount: Number(row.doctor_count),
    smsCount: Number(row.sms_count),
    totalCents: Number(row.total_cents),
  }));
}

export async function loadBillingRates(): Promise<BillingRate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_billing_rates");
  if (error) throw new DataAccessError(classifyDatabaseError(error));
  return (data ?? []).map((row: Record<string, unknown>) => ({
    effectiveMonth: row.effective_month as string,
    subscriptionCents: Number(row.subscription_cents),
    smsUnitCents: Number(row.sms_unit_cents),
  }));
}

export async function setNextBillingRates(subscriptionCents: number, smsUnitCents: number) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_next_billing_rates", {
    new_subscription_cents: subscriptionCents,
    new_sms_unit_cents: smsUnitCents,
  });
  if (error) throw new DataAccessError(classifyDatabaseError(error));
}

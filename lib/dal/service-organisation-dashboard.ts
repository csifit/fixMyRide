import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type OrganisationLocationMetric = {
  id: string;
  name: string;
  city: string | null;
  status: string;
  appointments: number;
  activeJobs: number;
  workloadMinutes: number;
  revenueByCurrency: Record<string, number>;
  openEstimates: number;
  overdueJobs: number;
  inventoryAlerts: number;
  averageRating: number | null;
  feedbackCount: number;
  cancellationRate: number;
};

export type OrganisationOpenEstimate = {
  id: string;
  workshopId: string;
  workshopName: string;
  bookingId: string;
  customerName: string;
  serviceName: string;
  totalCents: number;
  currency: string;
  sentAt: string;
};

export type OrganisationOverdueJob = {
  id: string;
  workshopId: string;
  workshopName: string;
  customerName: string;
  serviceName: string;
  status: string;
  scheduledAt: string;
};

export type OrganisationMonthlyMetric = {
  month: string;
  appointments: number;
  completedJobs: number;
  workloadMinutes: number;
  revenueByCurrency: Record<string, number>;
  cancellationRate: number;
  averageRating: number | null;
};

export type ServiceOrganisationOperationalDashboard = {
  providerId: string;
  providerName: string;
  generatedAt: string;
  locations: OrganisationLocationMetric[];
  openEstimates: OrganisationOpenEstimate[];
  overdueJobs: OrganisationOverdueJob[];
  months: OrganisationMonthlyMetric[];
};

export type ServiceOrganisationQualityMetrics = {
  openCases: number;
  resolvedCases: number;
  comebackRate: number;
  locations: Array<{ workshopId: string; workshopName: string; openCases: number; totalCases: number }>;
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadServiceOrganisationOperationalDashboard(providerId: string, months = 6): Promise<ServiceOrganisationOperationalDashboard> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_service_organisation_operational_dashboard", {
    requested_service_provider_id: providerId,
    requested_months: months,
  });
  if (error) fail(error);
  return data as ServiceOrganisationOperationalDashboard;
}

export async function loadServiceOrganisationQualityMetrics(providerId: string): Promise<ServiceOrganisationQualityMetrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_service_organisation_quality_metrics", {
    requested_service_provider_id: providerId,
  });
  if (error) fail(error);
  return data as ServiceOrganisationQualityMetrics;
}

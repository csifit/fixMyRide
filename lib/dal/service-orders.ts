import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";
import type { BookingResource } from "./workshop-scheduling";

export type ServiceOrderEstimateItem = {
  type: "labor" | "part" | "other";
  description: string;
  quantity: number;
  lineTotalCents: number;
};

export type ServiceOrder = {
  bookingId: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  confirmedStart: string | null;
  durationMinutes: number;
  workshop: {
    name: string;
    organisation: string;
    address: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  };
  customer: { name: string; phone: string; email: string };
  vehicle: {
    registration: string;
    make: string;
    model: string;
    year: number | null;
    vin: string | null;
    mileageKm: number | null;
  };
  serviceName: string;
  customerNote: string | null;
  workshopNote: string | null;
  mechanicOverride: string | null;
  receptionCondition: string | null;
  resources: Array<{ kind: "mechanic" | "bay" | "ramp"; name: string }>;
  estimate: null | {
    status: string;
    diagnosis: string;
    currency: string;
    totalCents: number;
    items: ServiceOrderEstimateItem[];
  };
  serviceRecord: null | {
    workSummary: string | null;
    inspectionSummary: string | null;
    parts: Array<{
      description: string;
      partNumber: string | null;
      quantity: number;
      warrantyExpiresOn: string | null;
    }>;
    recommendations: Array<{
      description: string;
      dueOn: string | null;
      dueMileageKm: number | null;
    }>;
  };
};

export type ServiceOrderFields = {
  orderNumber: string | null;
  mechanicOverride: string | null;
  receptionCondition: string | null;
  resources: BookingResource[];
};

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadManagedServiceOrderFields() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_service_order_fields");
  if (error) fail(error);
  return new Map(((data ?? []) as Record<string, unknown>[]).map((row) => [
    row.booking_id as string,
    {
      orderNumber: row.service_order_number as string | null,
      mechanicOverride: row.mechanic_override as string | null,
      receptionCondition: row.reception_condition as string | null,
      resources: Array.isArray(row.resources) ? row.resources as BookingResource[] : [],
    } satisfies ServiceOrderFields,
  ]));
}

export async function updateManagedServiceOrderDetails(input: {
  bookingId: string;
  mechanicOverride: string | null;
  receptionCondition: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_service_order_details", {
    requested_booking_id: input.bookingId,
    requested_mechanic_override: input.mechanicOverride,
    requested_reception_condition: input.receptionCondition,
  });
  if (error) fail(error);
}

export async function loadManagedServiceOrder(bookingId: string): Promise<ServiceOrder> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_managed_service_order", {
    requested_booking_id: bookingId,
  });
  if (error) fail(error);
  if (!data) fail({ code: "P0002" });
  return data as ServiceOrder;
}

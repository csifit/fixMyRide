import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CapacityResource,
  PersonnelType,
  WorkshopCapacityLocation,
  WorkstationType,
} from "@/lib/workshop-capacity";
import { classifyDatabaseError, DataAccessError } from "./errors";

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadWorkshopCapacityResources(): Promise<WorkshopCapacityLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_workshop_capacity_resources");
  if (error) fail(error);
  const locations = new Map<string, WorkshopCapacityLocation>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const workshopId = row.workshop_id as string;
    const location = locations.get(workshopId) ?? {
      workshopId,
      workshopName: row.workshop_name as string,
      city: row.workshop_city as string | null,
      dailyCapacity: Number(row.daily_capacity),
      resources: [],
    };
    if (row.resource_id) location.resources.push({
      id: row.resource_id as string,
      category: row.resource_category as CapacityResource["category"],
      type: row.resource_type as CapacityResource["type"],
      name: row.resource_name as string,
      active: Boolean(row.resource_active),
      assignedStationId: row.assigned_station_id as string | null,
      assignedStationName: row.assigned_station_name as string | null,
      absences: Array.isArray(row.absences)
        ? row.absences as CapacityResource["absences"]
        : [],
    });
    locations.set(workshopId, location);
  }
  return [...locations.values()];
}

export async function createCapacityResource(input: {
  workshopId: string;
  category: "personnel" | "workstation";
  type: PersonnelType | WorkstationType;
  name: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_workshop_capacity_resource", {
    requested_workshop_id: input.workshopId,
    requested_category: input.category,
    requested_type: input.type,
    requested_name: input.name,
  });
  if (error) fail(error);
}

export async function setPersonnelWorkstation(input: {
  personnelResourceId: string;
  workstationResourceId: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workshop_personnel_workstation", {
    requested_personnel_resource_id: input.personnelResourceId,
    requested_workstation_resource_id: input.workstationResourceId,
  });
  if (error) fail(error);
}

export async function setWorkshopDailyCapacity(input: {
  workshopId: string;
  dailyCapacity: number;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workshop_daily_booking_capacity", {
    requested_workshop_id: input.workshopId,
    requested_daily_capacity: input.dailyCapacity,
  });
  if (error) fail(error);
}

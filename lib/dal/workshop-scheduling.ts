import "server-only";

import { createClient } from "@/lib/supabase/server";
import { classifyDatabaseError, DataAccessError } from "./errors";

export type WorkshopResourceKind = "mechanic" | "bay" | "ramp";
export type WorkshopResourceAbsence = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};
export type WorkshopScheduleResource = {
  id: string;
  kind: WorkshopResourceKind;
  name: string;
  active: boolean;
  absences: WorkshopResourceAbsence[];
};
export type WorkshopSchedule = {
  workshopId: string;
  workshopName: string;
  dailyCapacity: number;
  resources: WorkshopScheduleResource[];
};
export type BookingResource = { id: string; kind: WorkshopResourceKind; name: string };

function fail(error: { code?: string; status?: number }): never {
  throw new DataAccessError(classifyDatabaseError(error));
}

export async function loadWorkshopScheduling() {
  const supabase = await createClient();
  const [resourcesResult, assignmentsResult] = await Promise.all([
    supabase.rpc("get_my_workshop_schedule_resources"),
    supabase.rpc("get_my_service_booking_resource_assignments"),
  ]);
  if (resourcesResult.error) fail(resourcesResult.error);
  if (assignmentsResult.error) fail(assignmentsResult.error);

  const schedules = new Map<string, WorkshopSchedule>();
  for (const value of (resourcesResult.data ?? []) as Record<string, unknown>[]) {
    const workshopId = value.workshop_id as string;
    const schedule = schedules.get(workshopId) ?? {
      workshopId,
      workshopName: value.workshop_name as string,
      dailyCapacity: Number(value.daily_capacity),
      resources: [],
    };
    if (value.resource_id) schedule.resources.push({
      id: value.resource_id as string,
      kind: value.resource_kind as WorkshopResourceKind,
      name: value.resource_name as string,
      active: Boolean(value.resource_active),
      absences: Array.isArray(value.absences) ? value.absences as WorkshopResourceAbsence[] : [],
    });
    schedules.set(workshopId, schedule);
  }
  const assignments = new Map<string, BookingResource[]>();
  for (const value of (assignmentsResult.data ?? []) as Record<string, unknown>[]) {
    assignments.set(value.booking_id as string,
      Array.isArray(value.resources) ? value.resources as BookingResource[] : []);
  }
  return { schedules: [...schedules.values()], assignments };
}

export async function createWorkshopResource(input: {
  workshopId: string; kind: WorkshopResourceKind; name: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_workshop_schedule_resource", {
    requested_workshop_id: input.workshopId,
    requested_kind: input.kind,
    requested_name: input.name,
  });
  if (error) fail(error);
}

export async function setWorkshopResourceActive(resourceId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workshop_schedule_resource_active", {
    requested_resource_id: resourceId, requested_active: active,
  });
  if (error) fail(error);
}

export async function addWorkshopResourceAbsence(input: {
  resourceId: string; startsAt: string; endsAt: string; reason: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_workshop_resource_absence", {
    requested_resource_id: input.resourceId,
    requested_starts_at: input.startsAt,
    requested_ends_at: input.endsAt,
    requested_reason: input.reason,
  });
  if (error) fail(error);
}

export async function removeWorkshopResourceAbsence(absenceId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_workshop_resource_absence", {
    requested_absence_id: absenceId,
  });
  if (error) fail(error);
}

export async function updateManagedBookingSchedule(input: {
  bookingId: string;
  start: string;
  durationMinutes: number;
  mechanicId: string | null;
  facilityId: string | null;
  replaceAssignments?: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_managed_booking_schedule", {
    requested_booking_id: input.bookingId,
    requested_start: input.start,
    requested_duration_minutes: input.durationMinutes,
    requested_mechanic_id: input.mechanicId,
    requested_facility_id: input.facilityId,
    replace_assignments: input.replaceAssignments ?? true,
  });
  if (error) fail(error);
}

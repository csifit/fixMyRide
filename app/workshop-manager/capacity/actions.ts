"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  createCapacityResource,
  setPersonnelWorkstation,
  setWorkshopDailyCapacity,
} from "@/lib/dal/workshop-capacity";
import { personnelTypes, workstationTypes } from "@/lib/workshop-capacity";
import {
  addWorkshopResourceAbsence,
  removeWorkshopResourceAbsence,
  setWorkshopResourceActive,
} from "@/lib/dal/workshop-scheduling";

export type CapacityActionState = {
  status: "idle" | "saved" | "created" | "assigned" | "removed"
    | "invalid" | "conflict" | "unauthorized" | "unavailable";
};

function refreshCapacity() {
  revalidatePath("/workshop-manager/capacity");
  revalidatePath("/service-organisation/capacity");
  revalidatePath("/workshop-manager/requests");
  revalidatePath("/service-organisation/requests");
}

function failure(error: unknown): CapacityActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "conflict") return { status: "conflict" };
    if (error.code === "invalid_input") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

const resourceSchema = z.discriminatedUnion("category", [
  z.object({
    workshopId: z.uuid(),
    category: z.literal("personnel"),
    type: z.enum(personnelTypes),
    name: z.string().trim().min(2).max(120),
  }),
  z.object({
    workshopId: z.uuid(),
    category: z.literal("workstation"),
    type: z.enum(workstationTypes),
    name: z.string().trim().min(2).max(120),
  }),
]);

export async function createCapacityResourceAction(
  _state: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const parsed = resourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await createCapacityResource(parsed.data);
    refreshCapacity();
    return { status: "created" };
  } catch (error) {
    return failure(error);
  }
}

export async function setCapacityResourceActiveAction(
  _state: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const parsed = z.object({
    resourceId: z.uuid(),
    active: z.enum(["true", "false"]).transform((value) => value === "true"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await setWorkshopResourceActive(parsed.data.resourceId, parsed.data.active);
    refreshCapacity();
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}

export async function addCapacityAbsenceAction(
  _state: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const parsed = z.object({
    resourceId: z.uuid(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    reason: z.string().trim().max(240).transform((value) => value || null),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || new Date(parsed.data.endsAt) <= new Date(parsed.data.startsAt)) {
    return { status: "invalid" };
  }
  try {
    await addWorkshopResourceAbsence(parsed.data);
    refreshCapacity();
    return { status: "created" };
  } catch (error) {
    return failure(error);
  }
}

export async function removeCapacityAbsenceAction(
  _state: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const parsed = z.object({ absenceId: z.uuid() })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await removeWorkshopResourceAbsence(parsed.data.absenceId);
    refreshCapacity();
    return { status: "removed" };
  } catch (error) {
    return failure(error);
  }
}

const assignmentSchema = z.object({
  personnelResourceId: z.uuid(),
  workstationResourceId: z.uuid().nullable(),
});

export async function assignPersonnelWorkstationAction(
  input: z.infer<typeof assignmentSchema>,
): Promise<CapacityActionState> {
  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  try {
    await setPersonnelWorkstation(parsed.data);
    refreshCapacity();
    return { status: "assigned" };
  } catch (error) {
    return failure(error);
  }
}

export async function setDailyCapacityAction(
  _state: CapacityActionState,
  formData: FormData,
): Promise<CapacityActionState> {
  const parsed = z.object({
    workshopId: z.uuid(),
    dailyCapacity: z.coerce.number().int().min(1).max(200),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await setWorkshopDailyCapacity(parsed.data);
    refreshCapacity();
    return { status: "saved" };
  } catch (error) {
    return failure(error);
  }
}

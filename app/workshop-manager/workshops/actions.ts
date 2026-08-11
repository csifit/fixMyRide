"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import { addMyWorkshopClosure, createMyWorkshopLocation, removeMyWorkshopClosure, updateMyWorkshopOperations } from "@/lib/dal/workshop-operations";

export type WorkshopOperationsActionState = { status: "idle" | "saved" | "created" | "location_created" | "removed" | "invalid" | "unauthorized" | "unavailable" };
const nullable = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const nullableNumber = z.union([z.literal(""), z.coerce.number()]).transform((value) => value === "" ? null : value);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const hourSchema = z.object({ weekday: z.number().int().min(0).max(6), closed: z.boolean(), opensAt: time.nullable(), closesAt: time.nullable() }).superRefine((value, context) => {
  if (!value.closed && (!value.opensAt || !value.closesAt || value.opensAt >= value.closesAt)) context.addIssue({ code: "custom", message: "invalid_hours" });
});
const updateSchema = z.object({
  workshopId: z.uuid(), displayName: z.string().trim().min(2).max(160), description: nullable(3000),
  publicPhone: nullable(40), publicEmail: z.union([z.literal(""), z.email().max(320)]).transform((value) => value || null),
  city: nullable(120), address: nullable(240), latitude: nullableNumber.refine((value) => value === null || (value >= -90 && value <= 90)),
  longitude: nullableNumber.refine((value) => value === null || (value >= -180 && value <= 180)),
  timeZone: z.enum(["Europe/Bucharest", "Europe/Budapest", "Europe/Berlin"]),
  minimumLeadMinutes: z.coerce.number().int().min(0).max(43200), bookingHorizonDays: z.coerce.number().int().min(1).max(365),
  dailyBookingCapacity: z.coerce.number().int().min(1).max(200), slotIntervalMinutes: z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)])),
  operatingHours: z.array(hourSchema).length(7), acceptsBookingRequests: z.boolean(), offersPickup: z.boolean(), offersCourtesyCar: z.boolean(), allowsWaitOnSite: z.boolean(),
}).refine((value) => (value.latitude === null) === (value.longitude === null));
const closureSchema = z.object({ workshopId: z.uuid(), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), reason: nullable(240) }).refine((value) => new Date(value.endsAt) > new Date(value.startsAt));
const removeSchema = z.object({ closureId: z.uuid() });
const coordinate = z.string().trim().min(1).transform(Number).pipe(z.number().finite());
const createLocationSchema = z.object({
  serviceProviderId: z.uuid(), displayName: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  city: z.string().trim().min(1).max(120), address: z.string().trim().min(2).max(240),
  latitude: coordinate.refine((value) => value >= -90 && value <= 90),
  longitude: coordinate.refine((value) => value >= -180 && value <= 180),
  publicPhone: nullable(40), publicEmail: z.union([z.literal(""), z.email().max(320)]).transform((value) => value || null),
});

function result(error: unknown): WorkshopOperationsActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "invalid_input" || error.code === "conflict") return { status: "invalid" };
  }
  return { status: "unavailable" };
}
function refresh() { revalidatePath("/workshop-manager/workshops"); revalidatePath("/service-organisation/locations"); revalidatePath("/workshops"); }

export async function updateWorkshopOperationsAction(_state: WorkshopOperationsActionState, formData: FormData): Promise<WorkshopOperationsActionState> {
  const hours = Array.from({ length: 7 }, (_, weekday) => {
    const closed = formData.get(`closed-${weekday}`) === "on";
    return { weekday, closed, opensAt: closed ? null : formData.get(`opensAt-${weekday}`), closesAt: closed ? null : formData.get(`closesAt-${weekday}`) };
  });
  const parsed = updateSchema.safeParse({
    workshopId: formData.get("workshopId"), displayName: formData.get("displayName"), description: formData.get("description"),
    publicPhone: formData.get("publicPhone"), publicEmail: formData.get("publicEmail"), city: formData.get("city"), address: formData.get("address"),
    latitude: formData.get("latitude"), longitude: formData.get("longitude"), timeZone: formData.get("timeZone"),
    minimumLeadMinutes: formData.get("minimumLeadMinutes"), bookingHorizonDays: formData.get("bookingHorizonDays"),
    dailyBookingCapacity: formData.get("dailyBookingCapacity"), slotIntervalMinutes: formData.get("slotIntervalMinutes"), operatingHours: hours,
    acceptsBookingRequests: formData.get("acceptsBookingRequests") === "on", offersPickup: formData.get("offersPickup") === "on",
    offersCourtesyCar: formData.get("offersCourtesyCar") === "on", allowsWaitOnSite: formData.get("allowsWaitOnSite") === "on",
  });
  if (!parsed.success) return { status: "invalid" };
  try { const { workshopId: id, ...input } = parsed.data; await updateMyWorkshopOperations({ id, ...input }); refresh(); return { status: "saved" }; } catch (error) { return result(error); }
}

export async function addWorkshopClosureAction(_state: WorkshopOperationsActionState, formData: FormData): Promise<WorkshopOperationsActionState> {
  const parsed = closureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try { await addMyWorkshopClosure(parsed.data); refresh(); return { status: "created" }; } catch (error) { return result(error); }
}

export async function removeWorkshopClosureAction(_state: WorkshopOperationsActionState, formData: FormData): Promise<WorkshopOperationsActionState> {
  const parsed = removeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try { await removeMyWorkshopClosure(parsed.data.closureId); refresh(); return { status: "removed" }; } catch (error) { return result(error); }
}

export async function createWorkshopLocationAction(_state: WorkshopOperationsActionState, formData: FormData): Promise<WorkshopOperationsActionState> {
  const parsed = createLocationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try {
    await createMyWorkshopLocation(parsed.data);
    refresh();
    revalidatePath("/workshop-manager/organisation");
    revalidatePath("/workshop-manager/invoicing");
    revalidatePath("/service-organisation/managers");
    revalidatePath("/service-organisation/billing");
    return { status: "location_created" };
  } catch (error) { return result(error); }
}

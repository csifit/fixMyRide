"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createPublicServiceBookingRequest, getPublicWorkshop, loadPublicWorkshopServices } from "@/lib/dal/public-workshops";

export type ServiceRequestState = {
  status: "idle" | "success" | "invalid" | "unavailable";
};

const schema = z.object({
  workshopId: z.uuid(),
  serviceId: z.uuid(),
  customerName: z.string().trim().min(2).max(160),
  customerPhone: z.string().trim().min(7).max(40),
  customerEmail: z.email().max(320),
  vehicleRegistration: z.string().trim().min(2).max(20),
  vehicleMake: z.string().trim().min(1).max(80),
  vehicleModel: z.string().trim().min(1).max(100),
  vehicleYear: z.string().transform((value) => value ? Number(value) : null).pipe(z.number().int().min(1886).max(2200).nullable()),
  vehicleVin: z.string().trim().toUpperCase().refine((value) => !value || /^[A-HJ-NPR-Z0-9]{17}$/.test(value)).transform((value) => value || null),
  mileageKm: z.string().transform((value) => value ? Number(value) : null).pipe(z.number().int().min(0).max(5_000_000).nullable()),
  preferredStart: z.iso.datetime(),
  alternateStart: z.string().transform((value) => value || null).pipe(z.iso.datetime().nullable()),
  customerNote: z.string().trim().max(2000).transform((value) => value || null),
  mobilityRequirement: z.enum(["none", "pickup", "courtesy_car", "wait_on_site"]),
  locale: z.enum(["en", "de", "ro", "hu"]),
  privacyAccepted: z.literal("yes"),
  diagnosisAccepted: z.string().optional(),
});

export async function requestServiceAction(
  _previous: ServiceRequestState,
  formData: FormData,
): Promise<ServiceRequestState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || new Date(parsed.data.preferredStart) <= new Date()) return { status: "invalid" };
  try {
    const [workshop, services] = await Promise.all([
      getPublicWorkshop(parsed.data.workshopId),
      loadPublicWorkshopServices(parsed.data.workshopId),
    ]);
    const service = services.find((item) => item.id === parsed.data.serviceId);
    if (!workshop || !service || (service.bookingMode !== "direct" && parsed.data.diagnosisAccepted !== "yes")) {
      return { status: "invalid" };
    }
    const managementToken = randomBytes(32).toString("base64url");
    const managementTokenDigest = createHash("sha256").update(managementToken).digest("hex");
    await createPublicServiceBookingRequest({ ...parsed.data, managementTokenDigest });
    return { status: "success" };
  } catch {
    return { status: "unavailable" };
  }
}

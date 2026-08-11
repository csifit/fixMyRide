"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assignAdminWorkshopManager,
  createAdminLocationManagerInvitation,
  createAdminOrganisationInvitation,
  createAdminWorkshopLocation,
  setAdminPlatformAccountStatus,
} from "@/lib/dal/admin-organisations";
import { DataAccessError } from "@/lib/dal/errors";
import { getSiteUrl } from "@/lib/site-url";

export type AdminWorkflowActionState = {
  status: "idle" | "saved" | "invalid" | "duplicate" | "unauthorized" | "unavailable";
  invitationUrl?: string;
};
function result(error: unknown): AdminWorkflowActionState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "conflict") return { status: "duplicate" };
    if (error.code === "invalid_input" || error.code === "not_found") return { status: "invalid" };
  }
  return { status: "unavailable" };
}
function optional(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
function optionalNumber(value: FormDataEntryValue | null) {
  const text = optional(value);
  return text === null ? null : Number(text);
}
function invitationSecret() {
  const token = randomBytes(32).toString("base64url");
  return { token, digest: createHash("sha256").update(token).digest("hex") };
}
function invitationUrl(id: string, token: string) {
  const url = new URL("/register/invitation", getSiteUrl());
  url.searchParams.set("id", id); url.searchParams.set("token", token);
  return url.toString();
}
function refresh() {
  revalidatePath("/admin"); revalidatePath("/admin/providers");
  revalidatePath("/admin/workshops"); revalidatePath("/admin/managers");
  revalidatePath("/admin/customers"); revalidatePath("/admin/security");
}

const organisationSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  displayName: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
  email: z.email().max(254),
});
export async function inviteServiceOrganisationAction(
  _state: AdminWorkflowActionState, formData: FormData,
): Promise<AdminWorkflowActionState> {
  const parsed = organisationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const secret = invitationSecret();
  try {
    const created = await createAdminOrganisationInvitation({
      ...parsed.data, countryCode: parsed.data.countryCode.toUpperCase(),
      tokenDigest: secret.digest,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    refresh();
    return { status: "saved", invitationUrl: invitationUrl(created.invitationId, secret.token) };
  } catch (error) { return result(error); }
}

const locationSchema = z.object({
  providerId: z.union([z.literal(""), z.uuid()]), displayName: z.string().trim().min(2).max(160),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
  publicEmail: z.union([z.literal(""), z.email().max(320)]),
  publicPhone: z.string().trim().max(40),
});
export async function createWorkshopLocationAction(
  _state: AdminWorkflowActionState, formData: FormData,
): Promise<AdminWorkflowActionState> {
  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  const latitude = optionalNumber(formData.get("latitude"));
  const longitude = optionalNumber(formData.get("longitude"));
  if (!parsed.success || (latitude === null) !== (longitude === null)
    || (latitude !== null && !Number.isFinite(latitude))
    || (longitude !== null && !Number.isFinite(longitude))) return { status: "invalid" };
  try {
    await createAdminWorkshopLocation({
      ...parsed.data, providerId: parsed.data.providerId || null,
      countryCode: parsed.data.countryCode.toUpperCase(),
      city: optional(formData.get("city")), address: optional(formData.get("address")),
      latitude, longitude, publicPhone: optional(formData.get("publicPhone")),
      publicEmail: optional(formData.get("publicEmail")),
    });
    refresh(); return { status: "saved" };
  } catch (error) { return result(error); }
}

const managerInviteSchema = z.object({
  workshopId: z.uuid(), email: z.email().max(254),
  assignmentRole: z.enum(["primary_manager", "manager"]),
});
export async function inviteLocationManagerAction(
  _state: AdminWorkflowActionState, formData: FormData,
): Promise<AdminWorkflowActionState> {
  const parsed = managerInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  const secret = invitationSecret();
  try {
    const id = await createAdminLocationManagerInvitation({
      ...parsed.data, tokenDigest: secret.digest,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });
    refresh(); return { status: "saved", invitationUrl: invitationUrl(id, secret.token) };
  } catch (error) { return result(error); }
}

const assignmentSchema = z.object({
  workshopId: z.uuid(), managerId: z.uuid(),
  assignmentRole: z.enum(["primary_manager", "manager"]),
});
export async function assignLocationManagerAction(
  _state: AdminWorkflowActionState, formData: FormData,
): Promise<AdminWorkflowActionState> {
  const parsed = assignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try { await assignAdminWorkshopManager(parsed.data); refresh(); return { status: "saved" }; }
  catch (error) { return result(error); }
}

const accountSchema = z.object({
  authUserId: z.uuid(), status: z.enum(["active", "deactivated", "blocked"]),
  reason: z.string().trim().min(2).max(500),
});
export async function updatePlatformAccountStatusAction(
  _state: AdminWorkflowActionState, formData: FormData,
): Promise<AdminWorkflowActionState> {
  const parsed = accountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "invalid" };
  try { await setAdminPlatformAccountStatus(parsed.data); refresh(); return { status: "saved" }; }
  catch (error) { return result(error); }
}

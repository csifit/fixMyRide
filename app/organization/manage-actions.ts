"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DataAccessError } from "@/lib/dal/errors";
import {
  createClinicDoctorInvitation,
  createDoctorStaffInvitation,
  setClinicDoctorMembershipStatus,
} from "@/lib/dal/invitations";
import { sendInvitationEmail } from "@/lib/email/invitation";
import { getSiteUrl } from "@/lib/site-url";

export type InvitationState = {
  status: "idle" | "created" | "created_email_failed" | "invalid" | "duplicate" | "unauthorized" | "unavailable";
  link?: string;
};
export type MembershipState = {
  status: "idle" | "saved" | "invalid" | "unauthorized" | "unavailable";
};

const invitationSchema = z.object({
  email: z.email().max(320),
  clinicId: z.union([z.literal(""), z.uuid()]),
  kind: z.enum(["clinic_doctor", "doctor_staff"]),
  language: z.enum(["en", "de", "ro", "hu"]),
});

function invitationError(error: unknown): InvitationState {
  if (error instanceof DataAccessError) {
    if (error.code === "unauthorized") return { status: "unauthorized" };
    if (error.code === "conflict") return { status: "duplicate" };
    if (error.code === "invalid_input") return { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function createInvitationAction(
  _state: InvitationState,
  formData: FormData,
): Promise<InvitationState> {
  const input = invitationSchema.safeParse({
    email: formData.get("email"),
    clinicId: formData.get("clinicId"),
    kind: formData.get("kind"),
    language: formData.get("language"),
  });
  if (!input.success) return { status: "invalid" };
  try {
    const token = input.data.kind === "clinic_doctor"
      ? await createClinicDoctorInvitation(input.data.clinicId, input.data.email)
      : await createDoctorStaffInvitation(input.data.email);
    const path = input.data.kind === "clinic_doctor"
      ? "/register/doctor"
      : "/register/staff";
    const link = `${path}?invitation=${encodeURIComponent(token)}`;
    const emailSent = await sendInvitationEmail({
      to: input.data.email,
      kind: input.data.kind,
      language: input.data.language,
      invitationUrl: `${getSiteUrl()}${link}`,
    });
    return {
      status: emailSent ? "created" : "created_email_failed",
      link,
    };
  } catch (error) {
    return invitationError(error);
  }
}

const membershipSchema = z.object({
  membershipId: z.uuid(),
  status: z.enum(["active", "suspended", "ended"]),
});

export async function updateMembershipAction(
  _state: MembershipState,
  formData: FormData,
): Promise<MembershipState> {
  const input = membershipSchema.safeParse({
    membershipId: formData.get("membershipId"),
    status: formData.get("status"),
  });
  if (!input.success) return { status: "invalid" };
  try {
    await setClinicDoctorMembershipStatus(
      input.data.membershipId,
      input.data.status,
    );
    revalidatePath("/clinic-manager");
    return { status: "saved" };
  } catch (error) {
    if (error instanceof DataAccessError) {
      if (error.code === "unauthorized") return { status: "unauthorized" };
      if (error.code === "invalid_input") return { status: "invalid" };
    }
    return { status: "unavailable" };
  }
}

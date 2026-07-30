"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyLoginError, type LoginErrorKind } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/server";

export type OrganizationLoginState = {
  error: LoginErrorKind | "configuration" | null;
};

const schema = z.object({
  portal: z.enum(["clinic_manager", "staff"]),
  email: z.email().max(254),
  password: z.string().min(8).max(256),
});

export async function organizationLoginAction(
  _state: OrganizationLoginState,
  formData: FormData,
): Promise<OrganizationLoginState> {
  const input = schema.safeParse({
    portal: formData.get("portal"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!input.success) return { error: "invalid_credentials" };
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "configuration" };
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: input.data.email,
    password: input.data.password,
  });
  if (error) return { error: classifyLoginError(error) };
  redirect(input.data.portal === "clinic_manager" ? "/clinic-manager" : "/staff");
}

export async function organizationLogoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}


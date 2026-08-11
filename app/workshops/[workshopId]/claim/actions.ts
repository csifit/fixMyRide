"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { beginMyWorkshopClaim } from "@/lib/dal/workshop-claims";
import { DataAccessError } from "@/lib/dal/errors";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";

const schema = z.object({ workshopId: z.uuid() });

export async function beginWorkshopClaimAction(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/workshops");
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") {
    redirect("/workshop-manager/login");
  }
  if (access.state !== "active") {
    redirect(`/workshops/${parsed.data.workshopId}?claim=account_required`);
  }

  let result: Awaited<ReturnType<typeof beginMyWorkshopClaim>>;
  try {
    result = await beginMyWorkshopClaim(parsed.data.workshopId);
  } catch (error) {
    if (error instanceof DataAccessError && error.code === "unauthorized") {
      redirect(`/workshops/${parsed.data.workshopId}?claim=unauthorized`);
    }
    redirect(`/workshops/${parsed.data.workshopId}?claim=unavailable`);
  }
  if (result.state === "claimed") {
    redirect(`/workshops/${parsed.data.workshopId}?claim=claimed`);
  }
  redirect(`/workshop-manager/invoicing?providerId=${result.providerId}&workshopId=${parsed.data.workshopId}&claim=${result.state}`);
}

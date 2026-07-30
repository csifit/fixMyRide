import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { loadPublicAppointmentStatus } from "@/lib/dal/public-appointments";
import StatusClient from "./StatusClient";

export const dynamic = "force-dynamic";

export default async function PublicAppointmentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  const digest = createHash("sha256").update(token).digest("hex");
  const request = await loadPublicAppointmentStatus(digest);
  if (!request) notFound();
  return <StatusClient request={request} />;
}

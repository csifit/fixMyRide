import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import {
  loadPublicAppointmentStatus,
  loadPublicDoctorSlots,
} from "@/lib/dal/public-appointments";
import StatusClient from "./StatusClient";

export const dynamic = "force-dynamic";

export default async function PublicAppointmentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; date?: string }>;
}) {
  const { token = "", date = "" } = await searchParams;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  const digest = createHash("sha256").update(token).digest("hex");
  const request = await loadPublicAppointmentStatus(digest);
  if (!request) notFound();
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const appointmentDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(request.scheduledStart));
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date
    : appointmentDate >= today ? appointmentDate : today;
  const canRequestChange = request.status === "confirmed"
    && request.changeRequest?.status !== "pending";
  const slots = canRequestChange
    ? await loadPublicDoctorSlots(request.clinicianId, selectedDate)
    : [];
  return <StatusClient
    request={request}
    token={token}
    selectedDate={selectedDate}
    slots={slots}
  />;
}

import { redirect } from "next/navigation";
import { getPatientAccess } from "@/lib/dal/patient-appointments";
import { loadMyGarage } from "@/lib/dal/garage";
import GarageClient from "./GarageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GaragePage() {
  const access = await getPatientAccess();
  if (access.state === "unauthenticated") redirect("/patient/login");
  if (access.state !== "active") redirect("/patient/appointments");
  const garage = await loadMyGarage();
  return <GarageClient {...garage} />;
}

import { notFound, redirect } from "next/navigation";
import { getCustomerAccess } from "@/lib/dal/platform-access";
import { loadMyVehicleServiceHistory } from "@/lib/dal/vehicle-service-history";
import VehicleServiceHistoryClient from "./VehicleServiceHistoryClient";

export const dynamic = "force-dynamic";

export default async function VehicleServiceHistoryPage({ params }: PageProps<"/garage/[vehicleId]">) {
  const access = await getCustomerAccess();
  if (access.state === "unauthenticated") redirect("/customer/login");
  if (access.state !== "active") redirect("/customer/login");
  const { vehicleId } = await params;
  let history;
  try { history = await loadMyVehicleServiceHistory(vehicleId); }
  catch { notFound(); }
  return <VehicleServiceHistoryClient {...history} />;
}

import { redirect } from "next/navigation";
import { getCustomerAccess } from "@/lib/dal/platform-access";
import { loadMyGarage } from "@/lib/dal/garage";
import GarageClient from "./GarageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GaragePage() {
  const access = await getCustomerAccess();
  if (access.state === "unauthenticated") redirect("/customer/login");
  if (access.state !== "active") redirect("/customer/login");
  const garage = await loadMyGarage();
  return <GarageClient {...garage} />;
}

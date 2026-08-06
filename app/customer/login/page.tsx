import { redirect } from "next/navigation";
import PlatformLoginForm from "@/app/authentication/PlatformLoginForm";
import { getCustomerAccess } from "@/lib/dal/platform-access";

export const dynamic = "force-dynamic";

export default async function CustomerLoginPage() {
  const access = await getCustomerAccess();
  if (access.state === "active") redirect("/customer/bookings");
  return <PlatformLoginForm portal="customer" configured={access.state !== "configuration"} />;
}

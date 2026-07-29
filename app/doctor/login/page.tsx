import { redirect } from "next/navigation";
import { getDoctorAccess } from "@/lib/dal/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorLoginPage() {
  const access = await getDoctorAccess();
  if (access.state !== "configuration" && access.state !== "unauthenticated") {
    redirect("/doctor");
  }
  return <LoginForm configured={access.state !== "configuration"} />;
}

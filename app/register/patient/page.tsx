import RegistrationForm from "../RegistrationForm";

export default async function PatientRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = "" } = await searchParams;
  const initialEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  return <RegistrationForm accountType="patient" initialEmail={initialEmail} />;
}

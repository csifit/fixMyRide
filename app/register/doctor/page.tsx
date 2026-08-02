import RegistrationForm from "../RegistrationForm";

export default async function DoctorRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string; email?: string }>;
}) {
  const { invitation, email } = await searchParams;
  return <RegistrationForm accountType="doctor" invitationToken={invitation} initialEmail={email} />;
}

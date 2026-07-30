import RegistrationForm from "../RegistrationForm";

export default async function DoctorRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const { invitation } = await searchParams;
  return <RegistrationForm accountType="doctor" invitationToken={invitation} />;
}

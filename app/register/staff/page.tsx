import RegistrationForm from "../RegistrationForm";

export default async function StaffRegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const { invitation } = await searchParams;
  return <RegistrationForm accountType="staff" invitationToken={invitation} />;
}

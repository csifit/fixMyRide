import RegistrationForm from "../RegistrationForm";

export default async function CustomerRegistrationPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return <RegistrationForm accountType="customer" initialEmail={email} />;
}

import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact support | Pitster",
  description: "Create a Pitster support ticket or report a platform problem.",
};

export default async function ContactPage({ searchParams }: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const initialType = type === "problem"
    ? "problem"
    : type === "account-closure"
      ? "account_closure"
      : "support";
  return <ContactClient initialType={initialType} />;
}

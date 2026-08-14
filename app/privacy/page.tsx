import type { Metadata } from "next";
import LegalDocumentClient from "@/app/legal/LegalDocumentClient";

export const metadata: Metadata = { title: "Privacy policy | Pitster", description: "How Pitster processes and protects personal data." };
export default function PrivacyPage() { return <LegalDocumentClient documentType="privacy" />; }


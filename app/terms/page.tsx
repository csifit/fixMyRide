import type { Metadata } from "next";
import LegalDocumentClient from "@/app/legal/LegalDocumentClient";

export const metadata: Metadata = { title: "Terms and conditions | Pitster", description: "Terms governing use of the Pitster vehicle-service platform." };
export default function TermsPage() { return <LegalDocumentClient documentType="terms" />; }


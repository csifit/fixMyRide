import type { Metadata } from "next";
import LegalDocumentClient from "@/app/legal/LegalDocumentClient";

export const metadata: Metadata = { title: "Cookie and external-services policy | Pitster", description: "Essential storage, Google Maps, and external services used by Pitster." };
export default function CookiesPage() { return <LegalDocumentClient documentType="cookies" />; }


import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { brand } from "@/lib/brand";
import "./globals.css";

const productionHost =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(productionHost),
  title: `${brand.name} — Connected patient and clinical care`,
  description:
    "A multilingual medical-profile service for patients and healthcare professionals.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: brand.name,
    description: "Clinical care, connected.",
    images: [{
      url: "/og-clinical.png",
      width: 1734,
      height: 907,
      alt: `${brand.name} clinical care portal`,
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: brand.name,
    description: "Clinical care, connected.",
    images: ["/og-clinical.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ "--brand-primary": brand.primaryColor } as CSSProperties}>
        {children}
      </body>
    </html>
  );
}

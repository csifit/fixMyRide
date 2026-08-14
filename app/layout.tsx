import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { brand } from "@/lib/brand";
import PrivacyNoticeModal from "./PrivacyNoticeModal";
import "./globals.css";

const productionHost =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.NODE_ENV === "production"
      ? "https://www.pitster.app"
      : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(productionHost),
  title: `${brand.name} — Find and book trusted vehicle service`,
  description:
    "Find trusted workshops, request vehicle service, approve estimates, and follow repairs online.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: brand.name,
    description: "Vehicle service, without the guesswork.",
    images: [{
      url: "/og.png",
      width: 1734,
      height: 907,
      alt: `${brand.name} vehicle service marketplace`,
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: brand.name,
    description: "Vehicle service, without the guesswork.",
    images: ["/og.png"],
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
        <PrivacyNoticeModal />
      </body>
    </html>
  );
}

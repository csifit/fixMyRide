import type { Metadata } from "next";
import "./globals.css";

const productionHost =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(productionHost),
  title: "VitaPass — Connected patient and clinical care",
  description:
    "A multilingual medical-profile prototype for patients and healthcare professionals.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "VitaPass",
    description: "Clinical care, connected.",
    images: [
      {
        url: "/og-clinical.png",
        width: 1734,
        height: 907,
        alt: "VitaPass clinical care portal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VitaPass",
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
      <body>{children}</body>
    </html>
  );
}

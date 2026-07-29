import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-clinical.png`;

  return {
    title: "VitaPass — Connected patient and clinical care",
    description:
      "A secure patient medical profile and clinical workspace for verified healthcare professionals.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title: "VitaPass",
      description: "Clinical care, connected.",
      images: [{ url: imageUrl, width: 1734, height: 907, alt: "VitaPass clinical care portal" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "VitaPass",
      description: "Clinical care, connected.",
      images: [imageUrl],
    },
  };
}

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

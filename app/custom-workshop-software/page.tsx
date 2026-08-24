import type { Metadata } from "next";
import CustomWorkshopSoftwareClient from "./CustomWorkshopSoftwareClient";

export const metadata: Metadata = {
  title: "Custom workshop management software | Pitster",
  description:
    "Tailored internal workshop management software for service organisations, dealership service departments, and multi-location automotive teams.",
  alternates: {
    canonical: "/custom-workshop-software",
  },
  openGraph: {
    title: "Custom workshop management software | Pitster",
    description:
      "A private workshop system designed around your service operation, processes, locations, and integrations.",
    url: "/custom-workshop-software",
  },
};

export default function CustomWorkshopSoftwarePage() {
  return <CustomWorkshopSoftwareClient />;
}

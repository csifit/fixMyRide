import type { Metadata } from "next";
import FaqClient from "./FaqClient";

export const metadata: Metadata = {
  title: "Frequently asked questions | Pitster",
  description: "Answers for customers, Service Organisations, and Workshop Managers using Pitster.",
};

export default function FrequentlyAskedQuestionsPage() {
  return <FaqClient />;
}

import type { Metadata } from "next";
import PlatformGuide, { type GuideSection } from "@/app/guides/PlatformGuide";

export const metadata: Metadata = {
  title: "Customer guide | Pitster",
  description: "How customers use Pitster to find workshops, request appointments, approve work, and follow repairs.",
};

const sections: GuideSection[] = [
  {
    id: "advantages",
    title: "What Pitster does for you",
    introduction: "Pitster keeps workshop discovery, booking, decisions, and repair updates in one clear journey.",
    benefits: [
      { title: "Find the right specialist", description: "Browse claimed workshops by vehicle type, service, and location, then review their facilities and offered services." },
      { title: "Start with diagnosis", description: "When the cause is uncertain, request a diagnosis first so the workshop can inspect the vehicle before proposing further work." },
      { title: "Stay in control", description: "Review appointment changes and repair proposals before they move forward. Important decisions remain visible in your account." },
      { title: "Follow the repair", description: "Track the repair lifecycle from booking through diagnosis, approval, work in progress, and collection, with the existing notifications alongside it." },
    ],
  },
  {
    id: "account-and-garage",
    title: "Set up your account and garage",
    introduction: "Your account connects bookings and repairs to the vehicles you own.",
    steps: [
      { title: "Sign in or register", description: "Use your customer email address to access your private booking and repair information." },
      { title: "Add a vehicle", description: "Open My Garage and save the vehicle details you will use for booking requests." },
      { title: "Keep details current", description: "Accurate registration, make, model, and vehicle type help a workshop prepare before your visit." },
    ],
  },
  {
    id: "find-a-workshop",
    title: "Find a workshop",
    introduction: "Search the public directory before sharing any repair request.",
    steps: [
      { title: "Choose the service", description: "Browse the complete service catalogue by car or van, motorcycle or scooter, electric bicycle, or electric kick scooter." },
      { title: "Set your location and date", description: "Use the map and search controls to narrow the results to practical options near you." },
      { title: "Open the workshop page", description: "Check contact details, exact map location, services, description, and whether the listing has been claimed." },
    ],
  },
  {
    id: "request-an-appointment",
    title: "Request an appointment",
    introduction: "A request starts the conversation; the workshop confirms the actual appointment.",
    steps: [
      { title: "Select your vehicle", description: "Choose a saved vehicle so the request includes the information the workshop needs." },
      { title: "Describe the need", description: "Select a service. Choose Diagnosis when you are unsure what is wrong, and add useful symptoms or context." },
      { title: "Send your preferred date", description: "The workshop may confirm it or suggest another available date. Review any proposed change before accepting." },
    ],
    note: "Sending a booking request does not by itself confirm an appointment or authorise repair work.",
  },
  {
    id: "approve-and-track",
    title: "Approve work and track progress",
    introduction: "Use the customer workspace as the shared record of what happens next.",
    steps: [
      { title: "Review the diagnosis", description: "After inspection, read the workshop findings and the proposed services or estimate." },
      { title: "Approve the proposal", description: "Confirm only the work you want carried out. Contact the workshop if anything needs clarification." },
      { title: "Follow each stage", description: "See repair lifecycle changes while keeping the established notifications available for timely updates." },
      { title: "Collect and retain the record", description: "When work is complete, follow the collection instruction and keep the booking history linked to your account." },
    ],
  },
];

export default function CustomerGuidePage() {
  return <PlatformGuide
    audience="Customer"
    title="Book and follow vehicle care with confidence"
    introduction="A practical guide to finding a provider, requesting an appointment, approving work, and tracking your repair."
    sections={sections}
    action={{ href: "/workshops", label: "Find a workshop" }}
  />;
}

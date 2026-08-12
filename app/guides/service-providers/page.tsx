import type { Metadata } from "next";
import PlatformGuide, { type GuideSection } from "@/app/guides/PlatformGuide";

export const metadata: Metadata = {
  title: "Service provider guide | Pitster",
  description: "How service organisations and workshop managers use Pitster to operate locations, bookings, and repairs.",
};

const sections: GuideSection[] = [
  {
    id: "advantages",
    title: "What Pitster does for your organisation",
    introduction: "Pitster gives service organisations a public presence and a structured operational path from first request to vehicle collection.",
    benefits: [
      { title: "Turn searches into requests", description: "A claimed public listing presents your exact location, contact details, description, and offered services to customers who need them." },
      { title: "Run multiple locations", description: "A service organisation can add workshop locations and give each location manager the access needed for daily work." },
      { title: "Standardise the customer journey", description: "Manage appointment requests, recommend diagnosis first, send proposals, and advance repairs through a consistent lifecycle." },
      { title: "Keep billing understandable", description: "Location charges are consolidated for the organisation, with upcoming and payment-attention states visible to authorised organisation users." },
    ],
  },
  {
    id: "join-and-sign-in",
    title: "Join and sign in",
    introduction: "Service organisation ownership and workshop management are deliberately separate roles.",
    steps: [
      { title: "Accept the admin invitation", description: "The organisation owner uses the latest invitation sent by the platform administrator, sets a password, and signs in as the service organisation." },
      { title: "Use the correct workspace", description: "Organisation owners manage locations, managers, and organisation-level billing. Workshop managers operate the location assigned to them." },
      { title: "Complete organisation details", description: "Keep the organisation identity and contact details current so locations and billing remain clearly connected." },
    ],
  },
  {
    id: "locations-and-billing",
    title: "Add and activate locations",
    introduction: "Each customer-facing workshop is represented by its own location.",
    steps: [
      { title: "Create the location", description: "Enter the workshop name, complete address, contact information, and accurate map position." },
      { title: "Confirm payment", description: "Complete the Stripe step required to activate paid location coverage. New locations begin billing from the next monthly billing period." },
      { title: "Watch billing status", description: "Review covered locations, the upcoming consolidated amount, successful payments, or a visible Payment attention state during the grace period." },
    ],
    note: "Organisation billing and payment information is not shown in the workshop manager workspace.",
  },
  {
    id: "invite-managers",
    title: "Invite workshop managers",
    introduction: "Give operational access to the person responsible for each physical location.",
    steps: [
      { title: "Choose the location", description: "Create the manager invitation from the service organisation workspace and associate it with the intended workshop." },
      { title: "Send the invitation", description: "The manager receives a distinct location-manager invitation and sets their own password." },
      { title: "Verify assignment", description: "Check that the manager sees the correct location and no organisation-level billing controls." },
    ],
  },
  {
    id: "publish-your-listing",
    title: "Prepare the public listing",
    introduction: "Complete information helps the right customer choose your workshop and submit a useful request.",
    steps: [
      { title: "Add opening times", description: "Set accurate working hours so the booking experience reflects when the location can receive vehicles." },
      { title: "Choose offered services", description: "Select from the catalogue for each supported vehicle type and keep the list focused on work the location can perform." },
      { title: "Review public details", description: "Check the contact card, map pin, About the shop information, and service list on the public workshop page." },
    ],
  },
  {
    id: "bookings-and-repairs",
    title: "Manage bookings and repairs",
    introduction: "The workshop manager handles the day-to-day customer workflow for their assigned location.",
    steps: [
      { title: "Respond to booking requests", description: "Confirm the requested date or propose an alternative. The customer must accept a changed date." },
      { title: "Diagnose before uncertain work", description: "Use the diagnosis-first path when the fault or final scope cannot be known safely from the initial request." },
      { title: "Send findings and proposals", description: "Record the diagnosis, proposed work, and estimate so the customer can make an informed approval decision." },
      { title: "Advance the repair lifecycle", description: "Update the vehicle through the operational stages and use notifications to keep the customer informed until collection." },
    ],
  },
];

export default function ServiceProviderGuidePage() {
  return <PlatformGuide
    audience="Service provider"
    title="Build your presence and operate every location"
    introduction="A practical guide for service organisation owners and the workshop managers who run their locations."
    sections={sections}
    action={{ href: "/register/workshop-manager", label: "Join the platform" }}
  />;
}

import type { Metadata } from "next";
import Link from "next/link";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Frequently asked questions | Pitster",
  description: "Answers for customers, Service Organisations, and Workshop Managers using Pitster.",
};

const questions = [
  {
    question: "What is the difference between a Service Organisation and a Workshop account?",
    answer: "A Service Organisation oversees one or more workshops, manages organisation-level access, and covers the payments for its workshop locations. A Workshop account is invitation-only and lets a Workshop Manager operate the specific location assigned to them.",
  },
  {
    question: "How does a Workshop Manager account work?",
    answer: "The Service Organisation sends an invitation to the manager’s email address. After accepting it and setting a password, the Workshop Manager can configure that workshop’s details, exact location, opening hours, and services.",
  },
  {
    question: "Can a Service Organisation manage more than one workshop?",
    answer: "Yes. It can add and oversee multiple locations, invite a manager for each workshop, and review performance, workload, inventory alerts, and billing across the organisation.",
  },
  {
    question: "Can anyone register for a Workshop Manager account?",
    answer: "No. Workshop Manager accounts are created only from an invitation sent by the Service Organisation responsible for that location.",
  },
  {
    question: "How do customers request an appointment?",
    answer: "Customers choose a claimed workshop, select a service or start with Diagnosis, add their vehicle and preferred time, and send a request. The workshop then confirms the appointment or proposes another time.",
  },
  {
    question: "When does billing begin for a new workshop location?",
    answer: "A location can be activated when payment is confirmed, but it starts contributing to the organisation’s consolidated monthly charge from the next billing month.",
  },
  {
    question: "What happens if an organisation payment fails?",
    answer: "The organisation sees a Payment attention status while Stripe retries the payment. A short grace period keeps the locations available while the payment issue is resolved.",
  },
];

export default function FrequentlyAskedQuestionsPage() {
  return <main className="faq-shell">
    <PublicSiteHeader />
    <section className="faq-hero">
      <p>Help centre</p>
      <h1>Frequently asked questions</h1>
      <span>Clear answers about accounts, workshop access, appointments, and billing.</span>
    </section>
    <section className="faq-layout">
      <aside>
        <strong>Need more help?</strong>
        <p>If your question is not answered here, contact the Pitster support team.</p>
        <a href={`mailto:${brand.supportEmail}`}>Contact support</a>
      </aside>
      <div className="faq-list">
        {questions.map((item, index) => <details key={item.question} open={index === 0}>
          <summary><span>{String(index + 1).padStart(2, "0")}</span>{item.question}</summary>
          <p>{item.answer}</p>
        </details>)}
      </div>
    </section>
    <footer className="faq-footer"><span>© {new Date().getFullYear()} {brand.name}</span><Link href="/">Back to Pitster</Link></footer>
  </main>;
}

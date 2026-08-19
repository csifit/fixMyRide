import Link from "next/link";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { readBookingAccessDigest } from "@/lib/booking-access-session";
import { loadGuestBookingAccess } from "@/lib/dal/booking-access";
import BookingAccessClient from "./BookingAccessClient";

export const dynamic = "force-dynamic";

export default async function BookingAccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const digest = await readBookingAccessDigest();
  const booking = digest ? await loadGuestBookingAccess(digest).catch(() => null) : null;
  if (booking) return <BookingAccessClient booking={booking} />;
  return <main className="booking-shell booking-access-shell"><PublicSiteHeader /><section className="booking-access-invalid"><span>!</span><h1>Booking link unavailable</h1><p>{error === "expired_link" ? "This private booking link has expired or is no longer valid." : "Open the private link from your booking email, or sign in to your customer account."}</p><div><Link href="/customer/login">Customer sign in</Link><Link href="/workshops">Find a workshop</Link></div></section></main>;
}

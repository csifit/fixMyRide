import { type NextRequest, NextResponse } from "next/server";
import { BOOKING_ACCESS_COOKIE, bookingAccessDigest } from "@/lib/booking-access-session";
import { loadGuestBookingAccess } from "@/lib/dal/booking-access";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const digest = bookingAccessDigest(token);
  const destination = new URL("/customer/booking-access", request.url);
  if (!digest) {
    destination.searchParams.set("error", "invalid_link");
    return NextResponse.redirect(destination);
  }
  const booking = await loadGuestBookingAccess(digest).catch(() => null);
  if (!booking) {
    destination.searchParams.set("error", "expired_link");
    return NextResponse.redirect(destination);
  }
  const response = NextResponse.redirect(destination);
  response.cookies.set(BOOKING_ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/customer/booking-access",
    maxAge: 60 * 60 * 24 * 90,
    priority: "high",
  });
  return response;
}

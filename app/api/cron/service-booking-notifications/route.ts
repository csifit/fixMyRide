import { NextResponse } from "next/server";
import { dispatchDueServiceBookingNotifications } from "@/lib/sms/service-booking-notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const serviceBookings = await dispatchDueServiceBookingNotifications();
    return NextResponse.json({ serviceBookings });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

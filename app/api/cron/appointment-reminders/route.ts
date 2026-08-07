import { NextResponse } from "next/server";
import { dispatchDueAppointmentNotifications } from "@/lib/sms/appointment-notifications";
import { dispatchDueServiceBookingNotifications } from "@/lib/sms/service-booking-notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const [appointments, serviceBookings] = await Promise.all([
      dispatchDueAppointmentNotifications(),
      dispatchDueServiceBookingNotifications(),
    ]);
    return NextResponse.json({ appointments, serviceBookings });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}

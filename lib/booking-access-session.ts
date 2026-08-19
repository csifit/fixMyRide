import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const BOOKING_ACCESS_COOKIE = "pitster_booking_access";

export function bookingAccessDigest(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export async function readBookingAccessDigest() {
  const token = (await cookies()).get(BOOKING_ACCESS_COOKIE)?.value;
  return token ? bookingAccessDigest(token) : null;
}

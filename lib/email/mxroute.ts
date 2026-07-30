import "server-only";

import { z } from "zod";

const mxrouteEnvironmentSchema = z.object({
  MXROUTE_SERVER: z.string().trim().min(3).max(253),
  MXROUTE_USERNAME: z.email().max(320),
  MXROUTE_PASSWORD: z.string().min(8).max(512),
});

function readMxrouteEnvironment() {
  return mxrouteEnvironmentSchema.safeParse({
    MXROUTE_SERVER: process.env.MXROUTE_SERVER,
    MXROUTE_USERNAME: process.env.MXROUTE_USERNAME,
    MXROUTE_PASSWORD: process.env.MXROUTE_PASSWORD,
  });
}

export async function sendMxrouteEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const environment = readMxrouteEnvironment();
  if (!environment.success) return false;

  try {
    const response = await fetch("https://smtpapi.mxroute.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server: environment.data.MXROUTE_SERVER,
        username: environment.data.MXROUTE_USERNAME,
        password: environment.data.MXROUTE_PASSWORD,
        from: environment.data.MXROUTE_USERNAME,
        to,
        subject,
        body: html,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const result = await response.json() as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}

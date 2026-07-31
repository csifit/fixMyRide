import "server-only";

import { z } from "zod";

const smsEnvironmentSchema = z.object({
  connectionId: z.string().min(1),
  password: z.string().min(1),
  test: z.boolean(),
});

const responseSchema = z.object({
  response_type: z.enum(["MESSAGE", "ERROR"]),
  response_id: z.coerce.string(),
  response_message: z.string(),
  message_id: z.union([z.string(), z.number()]).optional(),
});

export type SmsDeliveryResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; errorCode: string };

function readSmsEnvironment() {
  return smsEnvironmentSchema.safeParse({
    connectionId: process.env.SMSLINK_CONNECTION_ID,
    password: process.env.SMSLINK_PASSWORD,
    test: process.env.SMSLINK_TEST_MODE === "true",
  });
}

export async function sendSmsLinkMessage(
  to: string,
  message: string,
): Promise<SmsDeliveryResult> {
  const environment = readSmsEnvironment();
  if (!environment.success) return { ok: false, errorCode: "configuration" };

  const body = {
    connection_id: environment.data.connectionId,
    password: environment.data.password,
    to,
    message: message.slice(0, 3200),
    test: environment.data.test ? "1" : "0",
  };
  try {
    const response = await fetch(
      "https://secure.smslink.ro/sms/gateway/communicate/json.php",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return { ok: false, errorCode: `http_${response.status}` };
    }
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, errorCode: "invalid_response" };
    if (parsed.data.response_type === "ERROR") {
      return { ok: false, errorCode: `smslink_${parsed.data.response_id}` };
    }
    return {
      ok: true,
      providerMessageId: parsed.data.message_id?.toString() ?? null,
    };
  } catch {
    return { ok: false, errorCode: "network_error" };
  }
}

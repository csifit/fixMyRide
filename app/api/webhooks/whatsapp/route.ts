import { createHmac, timingSafeEqual } from "node:crypto";
import { recordWhatsAppInbound, recordWhatsAppStatus } from "@/lib/dal/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function validWhatsAppSignature(body: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const received = signature.slice(7);
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(received) || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const valid = url.searchParams.get("hub.mode") === "subscribe"
    && url.searchParams.get("hub.verify_token") === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    && Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN);
  const challenge = url.searchParams.get("hub.challenge");
  return valid && challenge
    ? new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } })
    : new Response("Forbidden", { status: 403 });
}

function messageBody(message: Record<string, unknown>) {
  const text = message.text as { body?: unknown } | undefined;
  if (typeof text?.body === "string") return text.body;
  const button = message.button as { text?: unknown } | undefined;
  if (typeof button?.text === "string") return button.text;
  const interactive = message.interactive as {
    button_reply?: { title?: unknown };
    list_reply?: { title?: unknown };
  } | undefined;
  if (typeof interactive?.button_reply?.title === "string") return interactive.button_reply.title;
  if (typeof interactive?.list_reply?.title === "string") return interactive.list_reply.title;
  return null;
}

function timestamp(value: unknown) {
  const seconds = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
  if (!validWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
  catch { return new Response("Invalid JSON", { status: 400 }); }
  if (payload.object !== "whatsapp_business_account") return new Response("Ignored", { status: 200 });

  const jobs: Array<Promise<void>> = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry as Record<string, unknown>[] : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes as Record<string, unknown>[] : []) {
      if (change.field !== "messages") continue;
      const value = change.value as Record<string, unknown> | undefined;
      for (const message of Array.isArray(value?.messages) ? value.messages as Record<string, unknown>[] : []) {
        const body = messageBody(message);
        if (typeof message.id !== "string" || typeof message.from !== "string" || !body) continue;
        const context = message.context as { id?: unknown } | undefined;
        jobs.push(recordWhatsAppInbound({
          providerMessageId: message.id,
          from: message.from,
          body,
          contextMessageId: typeof context?.id === "string" ? context.id : null,
          occurredAt: timestamp(message.timestamp),
        }));
      }
      for (const status of Array.isArray(value?.statuses) ? value.statuses as Record<string, unknown>[] : []) {
        if (typeof status.id !== "string" || typeof status.status !== "string") continue;
        const errors = Array.isArray(status.errors) ? status.errors as Record<string, unknown>[] : [];
        const errorCode = errors[0]?.code == null ? null : String(errors[0].code).slice(0, 120);
        jobs.push(recordWhatsAppStatus({
          providerMessageId: status.id,
          status: status.status,
          occurredAt: timestamp(status.timestamp),
          errorCode,
        }));
      }
    }
  }
  try { await Promise.all(jobs); }
  catch { return new Response("Temporary failure", { status: 503 }); }
  return new Response("EVENT_RECEIVED", { status: 200 });
}

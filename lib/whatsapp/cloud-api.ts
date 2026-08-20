import "server-only";

import { z } from "zod";

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; errorCode: string };

const baseConfigurationSchema = z.object({
  accessToken: z.string().min(20),
  phoneNumberId: z.string().regex(/^\d{5,30}$/),
  graphVersion: z.string().regex(/^v\d+\.\d+$/),
});

function baseConfiguration() {
  return baseConfigurationSchema.safeParse({
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim(),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
    graphVersion: process.env.WHATSAPP_GRAPH_API_VERSION?.trim(),
  });
}

function templateName() {
  const value = process.env.WHATSAPP_TEMPLATE_BOOKING_UPDATE?.trim() ?? "";
  return /^[a-z0-9_]{3,512}$/.test(value) ? value : null;
}

function recipient(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

const templateLanguages = {
  en: () => process.env.WHATSAPP_TEMPLATE_LANGUAGE_EN?.trim() || "en_US",
  de: () => process.env.WHATSAPP_TEMPLATE_LANGUAGE_DE?.trim() || "de",
  ro: () => process.env.WHATSAPP_TEMPLATE_LANGUAGE_RO?.trim() || "ro",
  hu: () => process.env.WHATSAPP_TEMPLATE_LANGUAGE_HU?.trim() || "hu",
} as const;

async function send(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
  const parsed = baseConfiguration();
  if (!parsed.success) return { ok: false, errorCode: "whatsapp_configuration" };
  try {
    const response = await fetch(
      `https://graph.facebook.com/${parsed.data.graphVersion}/${parsed.data.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${parsed.data.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...body }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = await response.json().catch(() => null) as {
      messages?: Array<{ id?: string }>;
      error?: { code?: number; error_subcode?: number };
    } | null;
    const messageId = payload?.messages?.[0]?.id;
    if (response.ok && messageId) return { ok: true, providerMessageId: messageId };
    const code = payload?.error?.error_subcode ?? payload?.error?.code ?? response.status;
    return { ok: false, errorCode: `whatsapp_${String(code).slice(0, 80)}` };
  } catch (error) {
    const code = error instanceof Error && error.name === "TimeoutError"
      ? "timeout"
      : "network";
    return { ok: false, errorCode: `whatsapp_${code}` };
  }
}

export async function sendWhatsAppTemplate(input: {
  to: string;
  locale: "en" | "de" | "ro" | "hu";
  parameters: string[];
}): Promise<WhatsAppSendResult> {
  const to = recipient(input.to);
  const name = templateName();
  if (!to || !name) return { ok: false, errorCode: "whatsapp_configuration" };
  return send({
    to,
    type: "template",
    template: {
      name,
      language: { code: templateLanguages[input.locale]() },
      components: [{
        type: "body",
        parameters: input.parameters.map((text) => ({ type: "text", text: text.slice(0, 1024) })),
      }],
    },
  });
}

export async function sendWhatsAppSessionText(input: {
  to: string;
  body: string;
}): Promise<WhatsAppSendResult> {
  const to = recipient(input.to);
  const body = input.body.trim();
  if (!to || !body || body.length > 4096) return { ok: false, errorCode: "whatsapp_invalid_message" };
  return send({ to, type: "text", text: { preview_url: false, body } });
}

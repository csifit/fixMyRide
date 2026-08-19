import "server-only";

import nodemailer from "nodemailer";
import { brand } from "@/lib/brand";

export type TransactionalEmailResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; errorCode: string };

function senderAddress(value: string | undefined) {
  if (!value) return null;
  const bracketed = value.match(/<([^<>]+)>\s*$/)?.[1]?.trim();
  const candidate = bracketed ?? value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageType: string;
  replyTo?: string | null;
}): Promise<TransactionalEmailResult> {
  const server = process.env.MXROUTE_SERVER?.trim();
  const username = process.env.MXROUTE_USERNAME?.trim();
  const password = process.env.MXROUTE_PASSWORD?.trim();
  const from = senderAddress(username);
  if (!server || !username || !password || !from) {
    return { ok: false, errorCode: "configuration" };
  }

  const transport = nodemailer.createTransport({
    host: server, port: 465, secure: true,
    auth: { user: username, pass: password },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2" },
  });
  try {
    const result = await transport.sendMail({
      from: { name: brand.name, address: from }, to: input.to,
      replyTo: input.replyTo || brand.supportEmail,
      subject: input.subject, text: input.text, html: input.html,
      headers: { "X-Pitster-Message-Type": input.messageType },
    });
    return result.accepted.length
      ? { ok: true, providerMessageId: result.messageId || null }
      : { ok: false, errorCode: "recipient_rejected" };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String(error.code).slice(0, 80)
      : "email_provider_error";
    console.error("transactional_email_delivery_failed", {
      messageType: input.messageType, errorCode: code,
    });
    return { ok: false, errorCode: code };
  } finally {
    transport.close();
  }
}

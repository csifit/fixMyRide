import "server-only";

import nodemailer from "nodemailer";
import { brand } from "@/lib/brand";

export type MaintenanceEmailResult = { delivery: "sent" | "failed" | "not_configured"; diagnostic?: string };

function emailAddress(value: string | undefined) {
  if (!value) return null;
  const bracketed = value.match(/<([^<>]+)>\s*$/)?.[1]?.trim();
  const candidate = bracketed ?? value;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function sendMaintenanceReminderEmail(input: {
  to: string;
  customerName: string;
  workshopName: string;
  vehicleRegistration: string;
  description: string;
  dueOn: string | null;
  bookingUrl: string;
}): Promise<MaintenanceEmailResult> {
  const server = process.env.MXROUTE_SERVER?.trim();
  const username = process.env.MXROUTE_USERNAME?.trim();
  const password = process.env.MXROUTE_PASSWORD?.trim();
  const from = emailAddress(username);
  if (!server || !username || !password || !from) return { delivery: "not_configured" };
  const due = input.dueOn ? new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: brand.timeZone }).format(new Date(`${input.dueOn}T12:00:00Z`)) : "soon";
  const subject = `${input.description} reminder from ${input.workshopName}`;
  const text = `Hello ${input.customerName},\n\nYour ${input.vehicleRegistration} is due for ${input.description} ${input.dueOn ? `on ${due}` : "soon"}.\n\nBook with ${input.workshopName}: ${input.bookingUrl}\n\nThis service reminder was sent by ${input.workshopName} through ${brand.name}.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f7f6;color:#17332f;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:#fff;border:1px solid #d5e2df;border-radius:14px"><tr><td style="padding:28px 32px"><strong style="font-size:22px;color:#006e6e">${escapeHtml(brand.name)}</strong><h1 style="font-size:26px">Upcoming service reminder</h1><p>Hello ${escapeHtml(input.customerName)},</p><p>Your <strong>${escapeHtml(input.vehicleRegistration)}</strong> is due for <strong>${escapeHtml(input.description)}</strong> ${input.dueOn ? `on ${escapeHtml(due)}` : "soon"}.</p><p><a href="${escapeHtml(input.bookingUrl)}" style="display:inline-block;padding:13px 18px;border-radius:8px;background:#006e6e;color:#fff;text-decoration:none;font-weight:700">Book at ${escapeHtml(input.workshopName)}</a></p><p style="color:#5d726d;font-size:13px">This service reminder was sent by ${escapeHtml(input.workshopName)} through ${escapeHtml(brand.name)}.</p></td></tr></table></td></tr></table></body></html>`;
  const transport = nodemailer.createTransport({
    host: server, port: 465, secure: true, auth: { user: username, pass: password },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    tls: { minVersion: "TLSv1.2" },
  });
  try {
    const result = await transport.sendMail({
      from: { name: brand.name, address: from }, to: input.to, replyTo: brand.supportEmail,
      subject, text, html, headers: { "X-Pitster-Message-Type": "maintenance-reminder" },
    });
    return result.accepted.length ? { delivery: "sent" } : { delivery: "failed", diagnostic: "No recipient accepted." };
  } catch (error) {
    const message = error instanceof Error ? error.message.replaceAll(password, "[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 240) : "MXroute delivery failed.";
    console.error("maintenance_email_delivery_failed", { message });
    return { delivery: "failed", diagnostic: message };
  } finally {
    transport.close();
  }
}

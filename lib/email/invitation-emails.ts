import "server-only";

import { brand } from "@/lib/brand";

export type InvitationEmailKind =
  | "admin_service_organisation"
  | "admin_location_manager"
  | "service_organisation_location_manager";

type InvitationEmailInput = {
  kind: InvitationEmailKind;
  to: string;
  invitationUrl: string;
  expiresAt: string;
  organisationName: string;
  workshopName?: string | null;
  assignmentRole?: "primary_manager" | "manager";
  invitationId: string;
  replacement?: boolean;
};

export type InvitationEmailDelivery =
  | "sent"
  | "not_configured"
  | "authentication_failed"
  | "invalid_server"
  | "sender_rejected"
  | "rate_limited"
  | "unavailable"
  | "failed";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function emailCopy(input: InvitationEmailInput) {
  const organisationName = input.organisationName.trim() || "the service organisation";
  const workshopName = input.workshopName?.trim() || "the workshop location";
  const role = input.assignmentRole === "primary_manager"
    ? "primary location manager"
    : "location manager";

  if (input.kind === "admin_service_organisation") {
    if (input.replacement) {
      return {
        badge: "ADMIN → SERVICE ORGANISATION · REPLACEMENT",
        subject: `Replacement admin invitation to service organisation: ${organisationName}`,
        title: "Admin invitation resent to a service organisation",
        description: `A ${brand.name} administrator reissued your organisation-owner invitation for ${organisationName}.`,
        detail: "This replacement invalidates every earlier invitation link. Use only the new link in this email.",
        action: "Accept replacement invitation",
      };
    }
    return {
      badge: "ADMIN → SERVICE ORGANISATION",
      subject: `Admin invitation to service organisation: ${organisationName}`,
      title: "Admin invitation to a service organisation",
      description: `A ${brand.name} administrator invited you to become the organisation owner for ${organisationName}.`,
      detail: "This is an administrator-issued invitation. It is not a location-manager invitation sent by a service organisation.",
      action: "Accept admin invitation",
    };
  }

  if (input.kind === "admin_location_manager") {
    return {
      badge: "ADMIN → LOCATION MANAGER",
      subject: `Admin invitation to manage ${workshopName}`,
      title: "Admin invitation to a location manager",
      description: `A ${brand.name} administrator invited you to join ${organisationName} as ${role} for ${workshopName}.`,
      detail: "This invitation was issued by a platform administrator on behalf of the service organisation.",
      action: "Accept admin invitation",
    };
  }

  return {
    badge: "SERVICE ORGANISATION → LOCATION MANAGER",
    subject: `${organisationName} invited you to manage ${workshopName}`,
    title: "Service organisation invitation",
    description: `${organisationName} invited you to join as ${role} for ${workshopName}.`,
    detail: "This location-manager invitation was issued by the service organisation, not by a platform administrator.",
    action: "Accept manager invitation",
  };
}

function message(input: InvitationEmailInput) {
  const copy = emailCopy(input);
  const expiry = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: brand.timeZone,
  }).format(new Date(input.expiresAt));
  const safeUrl = escapeHtml(input.invitationUrl);
  const safeBrand = escapeHtml(brand.name);

  return {
    subject: copy.subject,
    text: [
      copy.title,
      "",
      copy.description,
      copy.detail,
      "",
      `${copy.action}: ${input.invitationUrl}`,
      "",
      `This one-time invitation expires on ${expiry} (${brand.timeZone}).`,
      `If you were not expecting this invitation, you can ignore this email or contact ${brand.supportEmail}.`,
    ].join("\n"),
    html: `<!doctype html>
<html lang="en"><body style="margin:0;background:#f3f7f6;color:#17332f;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f3f7f6"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border:1px solid #d5e2df;border-radius:14px;background:#fff;overflow:hidden">
      <tr><td style="padding:28px 32px;border-bottom:1px solid #e5eeec"><strong style="font-size:22px;color:#006e6e">${safeBrand}</strong></td></tr>
      <tr><td style="padding:32px">
        <div style="display:inline-block;padding:6px 9px;border-radius:999px;background:#e9f5f3;color:#006e6e;font-size:11px;font-weight:700;letter-spacing:.5px">${escapeHtml(copy.badge)}</div>
        <h1 style="margin:18px 0 12px;font-size:27px;line-height:1.2">${escapeHtml(copy.title)}</h1>
        <p style="margin:0 0 12px;line-height:1.6">${escapeHtml(copy.description)}</p>
        <p style="margin:0 0 24px;color:#5d726d;line-height:1.6">${escapeHtml(copy.detail)}</p>
        <a href="${safeUrl}" style="display:inline-block;padding:13px 18px;border-radius:8px;background:#006e6e;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(copy.action)}</a>
        <p style="margin:24px 0 8px;color:#5d726d;font-size:13px;line-height:1.5">This one-time invitation expires on ${escapeHtml(expiry)} (${escapeHtml(brand.timeZone)}).</p>
        <p style="margin:0;color:#5d726d;font-size:13px;line-height:1.5">If you were not expecting this invitation, ignore this email or contact <a href="mailto:${escapeHtml(brand.supportEmail)}">${escapeHtml(brand.supportEmail)}</a>.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  };
}

export async function sendInvitationEmail(
  input: InvitationEmailInput,
): Promise<InvitationEmailDelivery> {
  const server = process.env.MXROUTE_SERVER?.trim();
  const username = process.env.MXROUTE_USERNAME?.trim();
  const password = process.env.MXROUTE_PASSWORD?.trim();
  const configuredFrom = process.env.INVITATION_EMAIL_FROM?.trim();
  const from = emailAddress(configuredFrom) ?? emailAddress(username);
  if (!server || !username || !password || !from) return "not_configured";

  const content = message(input);
  try {
    const response = await fetch("https://smtpapi.mxroute.com/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server,
        username,
        password,
        from,
        to: input.to,
        subject: content.subject,
        body: content.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as {
      success?: boolean; message?: string;
    } | null;
    if (response.ok && payload?.success === true) return "sent";

    const delivery = classifyMxrouteFailure(response.status, payload?.message);
    console.error("invitation_email_delivery_failed", {
      provider: "mxroute", delivery, status: response.status,
    });
    return delivery;
  } catch {
    console.error("invitation_email_delivery_failed", {
      provider: "mxroute", delivery: "unavailable",
    });
    return "unavailable";
  }
}

function emailAddress(value: string | undefined) {
  if (!value) return null;
  const bracketed = value.match(/<([^<>]+)>\s*$/)?.[1]?.trim();
  const candidate = bracketed ?? value;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function classifyMxrouteFailure(
  status: number,
  message: string | undefined,
): Exclude<InvitationEmailDelivery, "sent"> {
  const normalized = message?.toLowerCase() ?? "";
  if (status === 429 || normalized.includes("rate limit")) return "rate_limited";
  if (status === 401 || status === 403 || normalized.includes("authentication")) {
    return "authentication_failed";
  }
  if (normalized.includes("invalid server")) return "invalid_server";
  if (normalized.includes("from") || normalized.includes("sender")) {
    return "sender_rejected";
  }
  if (status >= 500) return "unavailable";
  return "failed";
}

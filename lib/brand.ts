const configuredColor = process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR;

export const brand = {
  id: process.env.NEXT_PUBLIC_BRAND_ID?.trim() || "pitster",
  name: process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "pitster",
  mark: process.env.NEXT_PUBLIC_BRAND_MARK?.trim() || "+",
  primaryColor:
    configuredColor && /^#[0-9a-f]{6}$/i.test(configuredColor)
      ? configuredColor
      : "#006E6E",
  supportEmail:
    process.env.NEXT_PUBLIC_BRAND_SUPPORT_EMAIL?.trim() || "support@pitster.app",
  timeZone:
    process.env.NEXT_PUBLIC_BRAND_TIME_ZONE?.trim() || "Europe/Bucharest",
} as const;

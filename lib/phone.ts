const callingCodes: Record<string, string> = {
  DE: "49",
  HU: "36",
  RO: "40",
};

const localeCountries: Record<string, keyof typeof callingCodes> = {
  de: "DE",
  hu: "HU",
  ro: "RO",
};

export function normalizeInternationalPhone(
  value: string,
  countryOrLocale?: string | null,
) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const international = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact;
  if (/^\+[1-9]\d{7,14}$/.test(international)) return international;

  const key = countryOrLocale?.trim();
  const country = key
    ? (key.length === 2 && key === key.toUpperCase()
      ? key
      : localeCountries[key.toLowerCase()])
    : undefined;
  const callingCode = country ? callingCodes[country] : undefined;
  if (!callingCode) return null;
  const local = compact.replace(/^0+/, "");
  const normalized = `+${callingCode}${local}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

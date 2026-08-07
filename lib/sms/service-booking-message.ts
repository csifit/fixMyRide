export const SERVICE_BOOKING_SMS_MAX_LENGTH = 150;

export type ServiceBookingNotificationKind =
  | "booking_confirmed"
  | "reminder_24h"
  | "repair_started"
  | "ready_for_pickup"
  | "review_request";

export type ServiceBookingMessageInput = {
  notification_kind: ServiceBookingNotificationKind;
  locale: "en" | "de" | "ro" | "hu";
  workshop_name: string;
  vehicle_registration: string;
  confirmed_start: string | null;
  timezone: string;
};

const languageTags = {
  en: "en-GB",
  de: "de-DE",
  ro: "ro-RO",
  hu: "hu-HU",
} as const;

function clean(value: string, length: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

export function serviceBookingMessage(input: ServiceBookingMessageInput) {
  const workshop = clean(input.workshop_name, 32);
  const vehicle = clean(input.vehicle_registration, 20);
  const date = input.confirmed_start
    ? new Intl.DateTimeFormat(languageTags[input.locale], {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: input.timezone,
      }).format(new Date(input.confirmed_start))
    : "";
  const copy = {
    en: {
      booking_confirmed: `pitster: Booking at ${workshop} confirmed for ${date}. Vehicle ${vehicle}.`,
      reminder_24h: `pitster reminder: ${vehicle} is booked at ${workshop} in 24 hours, ${date}.`,
      repair_started: `pitster: Work has started on ${vehicle} at ${workshop}.`,
      ready_for_pickup: `pitster: ${vehicle} is ready for pickup at ${workshop}.`,
      review_request: `pitster: How was your service at ${workshop}? Review your visit: https://pitster.app/customer/bookings`,
    },
    de: {
      booking_confirmed: `pitster: Termin bei ${workshop} am ${date} bestaetigt. Fahrzeug ${vehicle}.`,
      reminder_24h: `pitster Erinnerung: Termin fuer ${vehicle} bei ${workshop} in 24 Stunden, ${date}.`,
      repair_started: `pitster: Die Arbeiten an ${vehicle} bei ${workshop} haben begonnen.`,
      ready_for_pickup: `pitster: ${vehicle} ist bei ${workshop} abholbereit.`,
      review_request: `pitster: Wie war Ihr Service bei ${workshop}? Besuch bewerten: https://pitster.app/customer/bookings`,
    },
    ro: {
      booking_confirmed: `pitster: Programarea la ${workshop} este confirmata pentru ${date}. Vehicul ${vehicle}.`,
      reminder_24h: `pitster: Programarea pentru ${vehicle} la ${workshop} este in 24 de ore, ${date}.`,
      repair_started: `pitster: Reparatia vehiculului ${vehicle} a inceput la ${workshop}.`,
      ready_for_pickup: `pitster: Vehiculul ${vehicle} este gata de ridicare de la ${workshop}.`,
      review_request: `pitster: Cum a fost serviciul la ${workshop}? Evalueaza vizita: https://pitster.app/customer/bookings`,
    },
    hu: {
      booking_confirmed: `pitster: Idopontja a(z) ${workshop} muhelyben megerositve: ${date}. Jarmu: ${vehicle}.`,
      reminder_24h: `pitster: ${vehicle} idopontja a(z) ${workshop} muhelyben 24 ora mulva lesz: ${date}.`,
      repair_started: `pitster: Megkezdodott a(z) ${vehicle} javitasa itt: ${workshop}.`,
      ready_for_pickup: `pitster: A(z) ${vehicle} atveheto itt: ${workshop}.`,
      review_request: `pitster: Milyen volt a szolgaltatas itt: ${workshop}? Ertekeles: https://pitster.app/customer/bookings`,
    },
  } as const;

  return clean(copy[input.locale][input.notification_kind], SERVICE_BOOKING_SMS_MAX_LENGTH);
}

export type BookingCommunicationLocale = "en" | "de" | "ro" | "hu";

export type BookingCommunicationMessageInput = {
  event_kind: string;
  audience: "customer" | "workshop";
  locale: BookingCommunicationLocale;
  customer_name: string;
  workshop_name: string;
  service_name: string;
  vehicle_registration: string;
  confirmed_start: string | null;
  proposed_start: string | null;
  note: string | null;
  timezone: string;
};

const languageTags = { en: "en-GB", de: "de-DE", ro: "ro-RO", hu: "hu-HU" } as const;

function date(input: BookingCommunicationMessageInput) {
  const value = input.proposed_start || input.confirmed_start;
  return value ? new Intl.DateTimeFormat(languageTags[input.locale], {
    dateStyle: "medium", timeStyle: "short", timeZone: input.timezone,
  }).format(new Date(value)) : "";
}

const customerCopy = {
  en: {
    booking_confirmed: "Your appointment is confirmed.", appointment_reminder: "Your appointment is in about 24 hours.", appointment_proposed: "The workshop proposed a different appointment time.", booking_rescheduled: "Your appointment was rescheduled.", booking_declined: "The workshop could not accept your request.", booking_cancelled: "The workshop cancelled your appointment.", estimate_ready: "A repair estimate is waiting for your decision.", repair_started: "Work on your vehicle has started.", ready_for_collection: "Your vehicle is ready for collection.", repair_completed: "Your service is complete.", review_request: "Your service is complete. You can now review the workshop.",
  },
  de: {
    booking_confirmed: "Ihr Termin ist bestätigt.", appointment_reminder: "Ihr Termin ist in ungefähr 24 Stunden.", appointment_proposed: "Die Werkstatt hat einen anderen Termin vorgeschlagen.", booking_rescheduled: "Ihr Termin wurde verschoben.", booking_declined: "Die Werkstatt konnte Ihre Anfrage nicht annehmen.", booking_cancelled: "Die Werkstatt hat Ihren Termin storniert.", estimate_ready: "Ein Kostenvoranschlag wartet auf Ihre Entscheidung.", repair_started: "Die Arbeiten an Ihrem Fahrzeug haben begonnen.", ready_for_collection: "Ihr Fahrzeug ist abholbereit.", repair_completed: "Der Service ist abgeschlossen.", review_request: "Der Service ist abgeschlossen. Sie können die Werkstatt jetzt bewerten.",
  },
  ro: {
    booking_confirmed: "Programarea ta este confirmată.", appointment_reminder: "Programarea ta este în aproximativ 24 de ore.", appointment_proposed: "Atelierul a propus o altă oră pentru programare.", booking_rescheduled: "Programarea ta a fost reprogramată.", booking_declined: "Atelierul nu a putut accepta cererea.", booking_cancelled: "Atelierul a anulat programarea.", estimate_ready: "Un deviz de reparație așteaptă decizia ta.", repair_started: "Lucrările la vehicul au început.", ready_for_collection: "Vehiculul este gata de ridicare.", repair_completed: "Service-ul este finalizat.", review_request: "Service-ul este finalizat. Acum poți evalua atelierul.",
  },
  hu: {
    booking_confirmed: "Az időpontja megerősítve.", appointment_reminder: "Az időpontja körülbelül 24 óra múlva lesz.", appointment_proposed: "A műhely másik időpontot javasolt.", booking_rescheduled: "Az időpontját átütemezték.", booking_declined: "A műhely nem tudta elfogadni a kérelmet.", booking_cancelled: "A műhely lemondta az időpontot.", estimate_ready: "Egy javítási árajánlat az Ön döntésére vár.", repair_started: "Megkezdődött a jármű javítása.", ready_for_collection: "A jármű átvehető.", repair_completed: "A szerviz elkészült.", review_request: "A szerviz elkészült. Most értékelheti a műhelyt.",
  },
} as const;

const workshopCopy: Record<string, string> = {
  booking_requested: "A new customer booking request is waiting for review.",
  proposal_accepted: "The customer accepted the proposed appointment.",
  proposal_declined: "The customer declined the proposed appointment.",
  customer_cancelled: "The customer cancelled the booking.",
  estimate_approved: "The customer approved the repair estimate.",
  estimate_declined: "The customer declined the repair estimate.",
};

export function bookingCommunicationCopy(input: BookingCommunicationMessageInput) {
  const eventCopy = input.audience === "workshop"
    ? workshopCopy[input.event_kind] ?? "A booking was updated."
    : customerCopy[input.locale][input.event_kind as keyof typeof customerCopy.en]
      ?? "Your booking was updated.";
  const appointment = date(input);
  const body = [
    eventCopy,
    `${input.service_name} · ${input.vehicle_registration}`,
    appointment || null,
    input.note || null,
  ].filter(Boolean).join("\n");
  return {
    subject: `${eventCopy} · ${input.workshop_name}`,
    body,
    sms: [eventCopy, appointment, input.vehicle_registration, input.workshop_name]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 150),
  };
}

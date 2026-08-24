"use client";

import Link from "next/link";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import type { Language } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";

type OfferCopy = {
  eyebrow: string;
  title: string;
  introduction: string;
  primaryAction: string;
  secondaryAction: string;
  audienceLabel: string;
  audiences: string[];
  choiceEyebrow: string;
  choiceTitle: string;
  choiceIntroduction: string;
  choices: Array<{ title: string; description: string }>;
  capabilitiesEyebrow: string;
  capabilitiesTitle: string;
  capabilitiesIntroduction: string;
  capabilities: Array<{ title: string; description: string }>;
  processEyebrow: string;
  processTitle: string;
  process: Array<{ title: string; description: string }>;
  ctaEyebrow: string;
  ctaTitle: string;
  ctaDescription: string;
  emailUs: string;
  backHome: string;
};

const copy: Record<Language, OfferCopy> = {
  en: {
    eyebrow: "Custom software for automotive service operations",
    title: "Your workshop process. Your own internal software.",
    introduction: "Pitster can support your team as a platform. If your organisation needs a private system built around its own service workflow, locations, roles and reporting, we can design and develop it with you.",
    primaryAction: "Discuss your requirements",
    secondaryAction: "See what we can cover",
    audienceLabel: "Designed for",
    audiences: ["Service organisations", "Dealership service departments", "Independent and multi-location workshop groups"],
    choiceEyebrow: "Built around the way you operate",
    choiceTitle: "Keep the workflow that makes your business work",
    choiceIntroduction: "You do not have to force established processes into generic software. We can scope a focused internal solution and agree whether it should work independently, connect to Pitster, or integrate with selected systems you already use.",
    choices: [
      { title: "Private and standalone", description: "An internal application for your team, locations and operational data." },
      { title: "Connected to Pitster", description: "Keep a private operational workspace while using relevant Pitster customer-facing services." },
      { title: "Integrated with your tools", description: "Plan practical connections, imports or exports for compatible accounting, parts, CRM or communication systems." },
    ],
    capabilitiesEyebrow: "Possible scope",
    capabilitiesTitle: "One clear view of workshop operations",
    capabilitiesIntroduction: "The exact scope is tailored to your organisation. A solution can bring together the service actions that matter to your team.",
    capabilities: [
      { title: "Bookings and work orders", description: "Manage intake, appointments, work orders, priorities and repair status from one operational flow." },
      { title: "Capacity and resources", description: "Plan technicians, skills, bays, lifts and specialist equipment by location and shift." },
      { title: "Diagnosis and approvals", description: "Record findings, prepare estimates, request decisions and keep a traceable repair history." },
      { title: "Parts and inventory", description: "Track stock, parts requirements, usage and purchasing steps alongside each job." },
      { title: "Customer communication", description: "Coordinate service updates and documents through suitable email, WhatsApp or SMS workflows." },
      { title: "Multi-location oversight", description: "Give each role the right access while management compares workload, progress, quality and performance." },
    ],
    processEyebrow: "A practical delivery path",
    processTitle: "Start with the operation, then shape the software",
    process: [
      { title: "Understand", description: "We map your locations, users, service journey, pain points and essential integrations." },
      { title: "Define", description: "Together we agree the first useful scope, priorities, responsibilities and delivery approach." },
      { title: "Build and validate", description: "Your operational team reviews the solution as it develops, so decisions stay grounded in daily work." },
      { title: "Launch and improve", description: "We plan migration, onboarding and support, then refine the system using real operational feedback." },
    ],
    ctaEyebrow: "Tell us how your workshop works",
    ctaTitle: "Let us explore the right internal system for your organisation.",
    ctaDescription: "Send us a short description of your organisation, number of locations and the processes you want to improve. We will arrange an initial conversation about fit and possible scope.",
    emailUs: "Email",
    backHome: "Back to the home page",
  },
  de: {
    eyebrow: "Individuelle Software für Kfz-Servicebetriebe",
    title: "Ihre Werkstattabläufe. Ihre eigene interne Software.",
    introduction: "Pitster kann Ihr Team als Plattform unterstützen. Benötigt Ihre Organisation ein privates System für die eigenen Serviceabläufe, Standorte, Rollen und Berichte, können wir es gemeinsam mit Ihnen konzipieren und entwickeln.",
    primaryAction: "Anforderungen besprechen",
    secondaryAction: "Möglichen Umfang ansehen",
    audienceLabel: "Entwickelt für",
    audiences: ["Serviceorganisationen", "Serviceabteilungen von Autohäusern", "Unabhängige Werkstattgruppen und Filialbetriebe"],
    choiceEyebrow: "Passend zu Ihrer Arbeitsweise",
    choiceTitle: "Behalten Sie die Abläufe, die Ihr Unternehmen erfolgreich machen",
    choiceIntroduction: "Sie müssen bewährte Prozesse nicht in eine Standardsoftware zwängen. Wir können eine gezielte interne Lösung definieren und gemeinsam festlegen, ob sie eigenständig, mit Pitster verbunden oder in ausgewählte vorhandene Systeme integriert wird.",
    choices: [
      { title: "Privat und eigenständig", description: "Eine interne Anwendung für Ihr Team, Ihre Standorte und Ihre Betriebsdaten." },
      { title: "Mit Pitster verbunden", description: "Ein privater Arbeitsbereich, ergänzt durch passende kundenorientierte Pitster-Dienste." },
      { title: "In Ihre Tools integriert", description: "Praktische Schnittstellen, Importe oder Exporte für kompatible Buchhaltungs-, Teile-, CRM- oder Kommunikationssysteme." },
    ],
    capabilitiesEyebrow: "Möglicher Umfang",
    capabilitiesTitle: "Ein klarer Überblick über den Werkstattbetrieb",
    capabilitiesIntroduction: "Der genaue Umfang wird auf Ihre Organisation zugeschnitten. Eine Lösung kann die für Ihr Team wichtigen Servicevorgänge zusammenführen.",
    capabilities: [
      { title: "Buchungen und Aufträge", description: "Annahme, Termine, Arbeitsaufträge, Prioritäten und Reparaturstatus in einem Ablauf verwalten." },
      { title: "Kapazität und Ressourcen", description: "Techniker, Qualifikationen, Arbeitsplätze, Hebebühnen und Spezialausrüstung nach Standort und Schicht planen." },
      { title: "Diagnose und Freigaben", description: "Befunde dokumentieren, Kostenvoranschläge erstellen, Entscheidungen einholen und eine nachvollziehbare Reparaturhistorie führen." },
      { title: "Teile und Bestand", description: "Bestände, Teilebedarf, Verbrauch und Beschaffung direkt am jeweiligen Auftrag verfolgen." },
      { title: "Kundenkommunikation", description: "Service-Updates und Dokumente über passende E-Mail-, WhatsApp- oder SMS-Abläufe koordinieren." },
      { title: "Standortübergreifende Steuerung", description: "Passende Zugriffsrechte vergeben und Auslastung, Fortschritt, Qualität und Leistung vergleichen." },
    ],
    processEyebrow: "Ein praxisnaher Weg",
    processTitle: "Zuerst den Betrieb verstehen, dann die Software gestalten",
    process: [
      { title: "Verstehen", description: "Wir erfassen Standorte, Nutzer, Serviceablauf, Engpässe und notwendige Integrationen." },
      { title: "Definieren", description: "Gemeinsam vereinbaren wir den ersten sinnvollen Umfang, Prioritäten, Zuständigkeiten und die Umsetzung." },
      { title: "Entwickeln und prüfen", description: "Ihr Betriebsteam prüft die Lösung während der Entwicklung, damit Entscheidungen im Arbeitsalltag verankert bleiben." },
      { title: "Einführen und verbessern", description: "Wir planen Migration, Einführung und Support und verbessern das System anhand echter Betriebserfahrungen." },
    ],
    ctaEyebrow: "Erzählen Sie uns, wie Ihre Werkstatt arbeitet",
    ctaTitle: "Lassen Sie uns das passende interne System für Ihre Organisation erkunden.",
    ctaDescription: "Senden Sie uns eine kurze Beschreibung Ihrer Organisation, die Anzahl der Standorte und die Abläufe, die Sie verbessern möchten. Wir vereinbaren ein erstes Gespräch über Eignung und möglichen Umfang.",
    emailUs: "E-Mail",
    backHome: "Zur Startseite",
  },
  ro: {
    eyebrow: "Software personalizat pentru operațiuni de service auto",
    title: "Procesele atelierului dvs. Software-ul intern propriu.",
    introduction: "Pitster vă poate sprijini echipa ca platformă. Dacă organizația are nevoie de un sistem privat construit în jurul propriului flux de service, al locațiilor, rolurilor și raportării, îl putem proiecta și dezvolta împreună.",
    primaryAction: "Discutați cerințele",
    secondaryAction: "Vedeți ce putem acoperi",
    audienceLabel: "Conceput pentru",
    audiences: ["Organizații de service", "Departamentele de service ale dealerilor auto", "Grupuri de ateliere independente sau cu mai multe locații"],
    choiceEyebrow: "Construit în jurul modului dvs. de lucru",
    choiceTitle: "Păstrați fluxul care face afacerea să funcționeze",
    choiceIntroduction: "Nu trebuie să adaptați procesele consacrate la un software generic. Putem defini o soluție internă concentrată și putem stabili dacă va funcționa independent, conectată la Pitster sau integrată cu anumite sisteme pe care le folosiți deja.",
    choices: [
      { title: "Privat și independent", description: "O aplicație internă pentru echipă, locații și datele operaționale." },
      { title: "Conectat la Pitster", description: "Păstrați un spațiu operațional privat și utilizați serviciile Pitster relevante pentru clienți." },
      { title: "Integrat cu instrumentele dvs.", description: "Planificăm conexiuni, importuri sau exporturi practice pentru sisteme compatibile de contabilitate, piese, CRM sau comunicare." },
    ],
    capabilitiesEyebrow: "Domeniu posibil",
    capabilitiesTitle: "O imagine clară asupra operațiunilor atelierului",
    capabilitiesIntroduction: "Domeniul exact este adaptat organizației. O soluție poate reuni acțiunile de service importante pentru echipă.",
    capabilities: [
      { title: "Programări și comenzi de lucru", description: "Gestionați recepția, programările, comenzile, prioritățile și starea reparațiilor într-un singur flux." },
      { title: "Capacitate și resurse", description: "Planificați tehnicienii, competențele, posturile, elevatoarele și echipamentele speciale pe locații și ture." },
      { title: "Diagnoză și aprobări", description: "Înregistrați constatările, pregătiți estimări, solicitați decizii și păstrați un istoric verificabil al reparațiilor." },
      { title: "Piese și inventar", description: "Urmăriți stocul, necesarul de piese, consumul și achizițiile împreună cu fiecare lucrare." },
      { title: "Comunicarea cu clienții", description: "Coordonați actualizările și documentele prin fluxuri potrivite de e-mail, WhatsApp sau SMS." },
      { title: "Control pentru mai multe locații", description: "Acordați accesul potrivit fiecărui rol și comparați volumul, progresul, calitatea și performanța." },
    ],
    processEyebrow: "Un parcurs practic",
    processTitle: "Începem cu operațiunile, apoi modelăm software-ul",
    process: [
      { title: "Înțelegere", description: "Cartografiem locațiile, utilizatorii, parcursul de service, dificultățile și integrările esențiale." },
      { title: "Definire", description: "Stabilim împreună primul domeniu util, prioritățile, responsabilitățile și modul de livrare." },
      { title: "Dezvoltare și validare", description: "Echipa operațională verifică soluția pe parcurs, astfel încât deciziile să rămână ancorate în activitatea zilnică." },
      { title: "Lansare și îmbunătățire", description: "Planificăm migrarea, instruirea și suportul, apoi rafinăm sistemul cu feedback operațional real." },
    ],
    ctaEyebrow: "Spuneți-ne cum funcționează atelierul",
    ctaTitle: "Haideți să explorăm sistemul intern potrivit pentru organizația dvs.",
    ctaDescription: "Trimiteți-ne o scurtă descriere a organizației, numărul de locații și procesele pe care doriți să le îmbunătățiți. Vom stabili o discuție inițială despre potrivire și domeniul posibil.",
    emailUs: "E-mail",
    backHome: "Înapoi la pagina principală",
  },
  hu: {
    eyebrow: "Egyedi szoftver autószerviz-műveletekhez",
    title: "Az Ön műhelyfolyamata. Saját belső szoftverrel.",
    introduction: "A Pitster platformként támogathatja csapatát. Ha szervezetének saját szervizfolyamataihoz, telephelyeihez, szerepköreihez és jelentéseihez igazodó privát rendszerre van szüksége, azt közösen megtervezhetjük és kifejleszthetjük.",
    primaryAction: "Igények egyeztetése",
    secondaryAction: "Lehetséges funkciók",
    audienceLabel: "Kinek készült",
    audiences: ["Szervizszervezetek", "Autókereskedések szervizrészlegei", "Független és több telephelyes műhelycsoportok"],
    choiceEyebrow: "Az Ön működéséhez igazítva",
    choiceTitle: "Tartsa meg a bevált üzleti folyamatokat",
    choiceIntroduction: "A kialakult folyamatokat nem kell általános szoftverhez igazítania. Meghatározhatunk egy célzott belső megoldást, és közösen dönthetünk arról, hogy önállóan működjön, kapcsolódjon a Pitsterhez, vagy integrálódjon a már használt rendszerekhez.",
    choices: [
      { title: "Privát és önálló", description: "Belső alkalmazás a csapat, a telephelyek és az operatív adatok számára." },
      { title: "Pitsterhez kapcsolva", description: "Privát operatív munkatér a Pitster megfelelő ügyféloldali szolgáltatásaival." },
      { title: "Meglévő eszközökkel integrálva", description: "Gyakorlati kapcsolatok, importok vagy exportok kompatibilis könyvelési, alkatrész-, CRM- vagy kommunikációs rendszerekhez." },
    ],
    capabilitiesEyebrow: "Lehetséges terjedelem",
    capabilitiesTitle: "Átlátható műhelyműködés egy helyen",
    capabilitiesIntroduction: "A pontos terjedelmet a szervezet igényeire szabjuk. A megoldás egyesítheti a csapat számára fontos szervizműveleteket.",
    capabilities: [
      { title: "Foglalások és munkalapok", description: "A munkafelvétel, időpontok, munkalapok, prioritások és javítási állapot egyetlen folyamatban kezelhető." },
      { title: "Kapacitás és erőforrások", description: "Technikusok, készségek, állások, emelők és speciális berendezések tervezése telephelyenként és műszakonként." },
      { title: "Diagnosztika és jóváhagyások", description: "Megállapítások rögzítése, árajánlatok készítése, döntések kérése és követhető javítási előzmények." },
      { title: "Alkatrészek és készlet", description: "Készlet, alkatrészigény, felhasználás és beszerzési lépések követése minden munkánál." },
      { title: "Ügyfélkommunikáció", description: "Szervizfrissítések és dokumentumok koordinálása megfelelő e-mail-, WhatsApp- vagy SMS-folyamatokkal." },
      { title: "Több telephely áttekintése", description: "Megfelelő hozzáférés szerepkörönként, valamint a terhelés, előrehaladás, minőség és teljesítmény összehasonlítása." },
    ],
    processEyebrow: "Gyakorlati megvalósítás",
    processTitle: "Először a működést értjük meg, majd kialakítjuk a szoftvert",
    process: [
      { title: "Megértés", description: "Feltérképezzük a telephelyeket, felhasználókat, szervizutat, problémákat és szükséges integrációkat." },
      { title: "Meghatározás", description: "Közösen rögzítjük az első hasznos terjedelmet, prioritásokat, felelősségeket és megvalósítási módot." },
      { title: "Fejlesztés és ellenőrzés", description: "Az operatív csapat fejlesztés közben értékeli a megoldást, így a döntések a napi munkán alapulnak." },
      { title: "Bevezetés és fejlesztés", description: "Megtervezzük a migrációt, betanítást és támogatást, majd valós működési visszajelzések alapján finomítjuk a rendszert." },
    ],
    ctaEyebrow: "Mutassa be, hogyan működik a műhelye",
    ctaTitle: "Keressük meg együtt a szervezetéhez illő belső rendszert.",
    ctaDescription: "Küldjön rövid leírást a szervezetről, a telephelyek számáról és a fejleszteni kívánt folyamatokról. Egyeztetünk egy első beszélgetést az illeszkedésről és a lehetséges terjedelemről.",
    emailUs: "E-mail",
    backHome: "Vissza a kezdőlapra",
  },
};

const contactEmails = ["admin@pitster.app", "admin@mkdir.click"] as const;

export default function CustomWorkshopSoftwareClient() {
  const [language] = useLanguage();
  const content = copy[language];

  return <main className="custom-software-page">
    <PublicSiteHeader />

    <section className="custom-software-hero">
      <div className="custom-software-hero-copy">
        <p>{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <span>{content.introduction}</span>
        <div className="custom-software-actions">
          <a href={`mailto:${contactEmails[0]}?subject=Custom%20workshop%20software`}>{content.primaryAction}</a>
          <a href="#capabilities">{content.secondaryAction}</a>
        </div>
      </div>
      <aside className="custom-software-audience">
        <strong>{content.audienceLabel}</strong>
        <ul>{content.audiences.map((audience) => <li key={audience}>{audience}</li>)}</ul>
      </aside>
    </section>

    <section className="custom-software-section custom-software-choice">
      <header>
        <p>{content.choiceEyebrow}</p>
        <h2>{content.choiceTitle}</h2>
        <span>{content.choiceIntroduction}</span>
      </header>
      <div className="custom-software-choice-grid">
        {content.choices.map((choice, index) => <article key={choice.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <h3>{choice.title}</h3>
          <p>{choice.description}</p>
        </article>)}
      </div>
    </section>

    <section className="custom-software-capabilities" id="capabilities">
      <div className="custom-software-section">
        <header>
          <p>{content.capabilitiesEyebrow}</p>
          <h2>{content.capabilitiesTitle}</h2>
          <span>{content.capabilitiesIntroduction}</span>
        </header>
        <div className="custom-software-capability-grid">
          {content.capabilities.map((capability) => <article key={capability.title}>
            <span aria-hidden="true">+</span>
            <div><h3>{capability.title}</h3><p>{capability.description}</p></div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="custom-software-section custom-software-process">
      <header>
        <p>{content.processEyebrow}</p>
        <h2>{content.processTitle}</h2>
      </header>
      <ol>
        {content.process.map((step, index) => <li key={step.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{step.title}</h3><p>{step.description}</p></div>
        </li>)}
      </ol>
    </section>

    <section className="custom-software-cta">
      <div>
        <p>{content.ctaEyebrow}</p>
        <h2>{content.ctaTitle}</h2>
        <span>{content.ctaDescription}</span>
      </div>
      <address>
        {contactEmails.map((email) => <a href={`mailto:${email}?subject=Custom%20workshop%20software`} key={email}>
          <span>{content.emailUs}</span>{email}
        </a>)}
      </address>
    </section>

    <footer className="custom-software-footer">
      <span>© {new Date().getFullYear()} {brand.name}</span>
      <Link href="/">{content.backHome}</Link>
    </footer>
  </main>;
}

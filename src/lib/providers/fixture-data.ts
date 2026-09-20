/**
 * Offline demo dataset.
 *
 * This is a small, self-consistent "world": businesses, the web pages those
 * businesses do (or do not) have, and a search index over them. It lets the app
 * run and be tested end-to-end with no API keys, and it deliberately contains
 * the hard cases the verification engine must get right:
 *
 *  - a business whose website is missing from the profile but findable by search
 *  - a business with genuinely no website
 *  - two different businesses with confusingly similar names
 *  - two branches of the same brand in different cities
 *  - a duplicate record of one business from a second source
 *  - a parked domain
 *  - a social-media-only presence
 *  - a website that is temporarily unreachable
 *  - a redirecting domain
 *  - a business with no phone number (identity cannot be confirmed)
 *
 * Everything produced from this file is flagged `isDemoData` and badged in the
 * UI. It must never be presented as real research.
 */

export interface FixtureBusiness {
  externalId: string;
  name: string;
  category: string;
  categoryLabel: string;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  email?: string | null;
  /** Website exactly as the "provider profile" reports it. */
  website: string | null;
  socialUrls?: string[];
  openingHoursRaw: string | null;
}

export const FIXTURE_BUSINESSES: FixtureBusiness[] = [
  {
    externalId: 'demo/1',
    name: 'Barbier am Seltersweg',
    category: 'barber',
    categoryLabel: 'Barber',
    street: 'Seltersweg', houseNumber: '12', postalCode: '35390', city: 'Gießen',
    lat: 50.5872, lon: 8.6748,
    phone: '+49 641 1234501',
    website: null, // profile has no website — but one exists and search finds it
    openingHoursRaw: 'Mo-Fr 09:00-18:30; Sa 09:00-14:00; Su off',
  },
  {
    externalId: 'demo/2',
    name: 'Haarstudio Melek',
    category: 'barber',
    categoryLabel: 'Hairdresser',
    street: 'Bahnhofstraße', houseNumber: '44', postalCode: '35390', city: 'Gießen',
    lat: 50.5849, lon: 8.6689,
    phone: '+49 641 1234502',
    website: null, // genuinely no website anywhere
    openingHoursRaw: 'Tu-Sa 09:00-18:00',
  },
  {
    externalId: 'demo/3',
    name: 'Cut & Shave Gießen',
    category: 'barber',
    categoryLabel: 'Barber',
    street: 'Ludwigsplatz', houseNumber: '3', postalCode: '35390', city: 'Gießen',
    lat: 50.5861, lon: 8.6731,
    phone: '+49 641 1234503',
    website: 'https://www.facebook.com/cutandshavegiessen',
    socialUrls: ['https://www.instagram.com/cutandshavegiessen'],
    openingHoursRaw: 'Mo-Sa 10:00-19:00',
  },
  {
    externalId: 'demo/4',
    // Same business as demo/1 from a second source, with a legal suffix.
    name: 'Barbier am Seltersweg GmbH',
    category: 'barber',
    categoryLabel: 'Barber',
    street: 'Seltersweg', houseNumber: '12', postalCode: '35390', city: 'Gießen',
    lat: 50.5872, lon: 8.6749,
    phone: '+49 641 1234501',
    website: null,
    openingHoursRaw: null,
  },
  {
    externalId: 'demo/5',
    name: 'Friseur Müller',
    category: 'barber',
    categoryLabel: 'Hairdresser',
    street: 'Grünberger Straße', houseNumber: '5', postalCode: '35394', city: 'Gießen',
    lat: 50.5903, lon: 8.7011,
    phone: '+49 641 1234505',
    website: 'http://muellerfriseur.de', // domain is parked
    openingHoursRaw: 'Mo-Fr 08:30-18:00',
  },
  {
    externalId: 'demo/6',
    // Same name as demo/5 but a different location: a separate business.
    name: 'Friseur Müller',
    category: 'barber',
    categoryLabel: 'Hairdresser',
    street: 'Bahnhofstraße', houseNumber: '2', postalCode: '35576', city: 'Wetzlar',
    lat: 50.5538, lon: 8.5029,
    phone: '+49 6441 1234506',
    website: null,
    openingHoursRaw: 'Mo-Fr 09:00-18:00; Sa 09:00-13:00',
  },
  {
    externalId: 'demo/7',
    name: 'Ristorante Da Vinci',
    category: 'restaurant',
    categoryLabel: 'Restaurant',
    street: 'Marktplatz', houseNumber: '7', postalCode: '35390', city: 'Gießen',
    lat: 50.5856, lon: 8.6765,
    phone: '+49 641 1234507',
    website: 'https://davinci-giessen.de',
    openingHoursRaw: 'Tu-Su 11:30-14:30,17:30-23:00; Mo off',
  },
  {
    externalId: 'demo/8',
    // Similar name to demo/7 — must never inherit demo/7's website.
    name: 'Da Vinci Pizzeria',
    category: 'restaurant',
    categoryLabel: 'Pizzeria',
    street: 'Frankfurter Straße', houseNumber: '100', postalCode: '35392', city: 'Gießen',
    lat: 50.5731, lon: 8.6795,
    phone: '+49 641 1234508',
    website: null,
    openingHoursRaw: 'Mo-Su 11:00-22:00',
  },
  {
    externalId: 'demo/9',
    // No phone number: identity cannot be confirmed from the profile alone.
    name: 'Kosmetikstudio Sonnenschein',
    category: 'beauty',
    categoryLabel: 'Beauty salon',
    street: 'Licher Straße', houseNumber: '20', postalCode: '35394', city: 'Gießen',
    lat: 50.5799, lon: 8.6919,
    phone: null,
    website: null,
    openingHoursRaw: 'Mo-Fr 10:00-18:00',
  },
  {
    externalId: 'demo/10',
    name: 'Nagelstudio Lotus',
    category: 'beauty',
    categoryLabel: 'Nail salon',
    street: 'Neustadt', houseNumber: '15', postalCode: '35390', city: 'Gießen',
    lat: 50.5884, lon: 8.6712,
    phone: '+49 641 1234510',
    website: null,
    openingHoursRaw: 'Mo-Sa 09:30-19:00',
  },
  {
    externalId: 'demo/11',
    name: 'Barbershop Kaiser',
    category: 'barber',
    categoryLabel: 'Barber',
    street: 'Kaiserstraße', houseNumber: '45', postalCode: '60329', city: 'Frankfurt am Main',
    lat: 50.1078, lon: 8.6669,
    phone: '+49 69 1234511',
    website: null,
    openingHoursRaw: 'Mo-Sa 09:00-20:00',
  },
  {
    externalId: 'demo/12',
    name: 'Sultan Barber',
    category: 'barber',
    categoryLabel: 'Barber',
    street: 'Münchener Straße', houseNumber: '8', postalCode: '60329', city: 'Frankfurt am Main',
    lat: 50.1062, lon: 8.6688,
    phone: '+49 69 1234512',
    website: null,
    openingHoursRaw: 'Mo-Sa 10:00-20:00',
  },
  {
    externalId: 'demo/13',
    name: 'Café Milano',
    category: 'cafe',
    categoryLabel: 'Café',
    street: 'Berger Straße', houseNumber: '120', postalCode: '60316', city: 'Frankfurt am Main',
    lat: 50.1247, lon: 8.7009,
    phone: '+49 69 1234513',
    website: 'http://cafemilano.de', // redirects to the real domain
    openingHoursRaw: 'Mo-Su 08:00-19:00',
  },
  {
    externalId: 'demo/14',
    name: 'Pizzeria Bella Napoli',
    category: 'restaurant',
    categoryLabel: 'Pizzeria',
    street: 'Leipziger Straße', houseNumber: '30', postalCode: '60487', city: 'Frankfurt am Main',
    lat: 50.1233, lon: 8.6395,
    phone: '+49 69 1234514',
    website: null, // search finds a same-name business in another city
    openingHoursRaw: 'Tu-Su 11:00-23:00; Mo off',
  },
  {
    externalId: 'demo/15',
    name: 'Elektro Schmidt GmbH',
    category: 'craft',
    categoryLabel: 'Electrician',
    street: 'Hanauer Landstraße', houseNumber: '200', postalCode: '60314', city: 'Frankfurt am Main',
    lat: 50.1141, lon: 8.7183,
    phone: '+49 69 1234515',
    website: 'https://elektro-schmidt.de', // server is down right now
    openingHoursRaw: 'Mo-Fr 07:30-16:30',
  },
  {
    externalId: 'demo/16',
    name: 'Fitness Point Frankfurt',
    category: 'fitness',
    categoryLabel: 'Gym',
    street: 'Hanauer Landstraße', houseNumber: '5', postalCode: '60314', city: 'Frankfurt am Main',
    lat: 50.1128, lon: 8.7022,
    phone: '+49 69 1234516',
    website: 'www.fitnesspoint-ffm.de',
    openingHoursRaw: 'Mo-Fr 06:00-23:00; Sa-Su 09:00-20:00',
  },
  {
    externalId: 'demo/17',
    name: 'Bella Napoli',
    category: 'restaurant',
    categoryLabel: 'Pizzeria',
    street: 'Kaiserstraße', houseNumber: '10', postalCode: '63065', city: 'Offenbach am Main',
    lat: 50.0993, lon: 8.7629,
    phone: '+49 69 1234517',
    website: 'https://bellanapoli-ffm.de',
    openingHoursRaw: 'Mo-Su 11:30-23:00',
  },
];

export interface FixturePage {
  status: number;
  /** When set, the fetcher follows this redirect. */
  redirectTo?: string;
  html?: string;
  /** When true, the fetch throws — simulating a server that is down. */
  fails?: boolean;
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}

/** The demo "web". Keys are hostnames without `www.`. */
export const FIXTURE_PAGES: Record<string, FixturePage> = {
  'barbier-seltersweg.de': {
    status: 200,
    html: page(
      'Barbier am Seltersweg — Ihr Barbier in Gießen',
      `<h1>Barbier am Seltersweg</h1>
       <p>Klassische Herrenschnitte und Rasuren mitten in Gießen.</p>
       <address>Seltersweg 12, 35390 Gießen</address>
       <p>Telefon: <a href="tel:+496411234501">0641 1234501</a></p>
       <p>Öffnungszeiten: Mo-Fr 09:00-18:30, Sa 09:00-14:00</p>`,
    ),
  },
  'muellerfriseur.de': {
    status: 200,
    html: page(
      'muellerfriseur.de',
      `<h1>Diese Domain steht zum Verkauf</h1>
       <p>Domain parking — buy this domain.</p>`,
    ),
  },
  'davinci-giessen.de': {
    status: 200,
    html: page(
      'Ristorante Da Vinci Gießen',
      `<h1>Ristorante Da Vinci</h1>
       <script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Ristorante Da Vinci","telephone":"+49 641 1234507","address":{"@type":"PostalAddress","streetAddress":"Marktplatz 7","postalCode":"35390","addressLocality":"Gießen"}}</script>
       <address>Marktplatz 7, 35390 Gießen</address>
       <p>Reservierungen: 0641 1234507</p>`,
    ),
  },
  'kaiser-barber.de': {
    status: 200,
    html: page(
      'Barbershop Kaiser Frankfurt',
      `<h1>Barbershop Kaiser</h1>
       <p>Kaiserstraße 45, 60329 Frankfurt am Main</p>
       <p>Termine nur über unser Online-Formular.</p>`,
    ),
  },
  'cafemilano.de': { status: 301, redirectTo: 'https://cafe-milano-frankfurt.de/' },
  'cafe-milano-frankfurt.de': {
    status: 200,
    html: page(
      'Café Milano — Berger Straße Frankfurt',
      `<h1>Café Milano</h1>
       <address>Berger Straße 120, 60316 Frankfurt am Main</address>
       <p>Tel. 069 1234513</p>`,
    ),
  },
  'bellanapoli-ffm.de': {
    status: 200,
    html: page(
      'Bella Napoli — Pizzeria in Offenbach',
      `<h1>Bella Napoli</h1>
       <address>Kaiserstraße 10, 63065 Offenbach am Main</address>
       <p>Telefon: 069 1234517</p>`,
    ),
  },
  'elektro-schmidt.de': { status: 0, fails: true },
  'fitnesspoint-ffm.de': {
    status: 200,
    html: page(
      'Fitness Point Frankfurt',
      `<h1>Fitness Point Frankfurt</h1>
       <address>Hanauer Landstraße 5, 60314 Frankfurt am Main</address>
       <p>Telefon 069 1234516</p>`,
    ),
  },
};

export interface FixtureSearchDoc {
  url: string;
  title: string;
  snippet: string;
  /** Words that must overlap with the query for this doc to be returned. */
  keywords: string[];
}

/** The demo search engine's index. Directory hits are included on purpose. */
export const FIXTURE_SEARCH_DOCS: FixtureSearchDoc[] = [
  {
    url: 'https://barbier-seltersweg.de/',
    title: 'Barbier am Seltersweg — Ihr Barbier in Gießen',
    snippet: 'Seltersweg 12, 35390 Gießen. Termine unter 0641 1234501.',
    keywords: ['barbier', 'seltersweg', 'giessen', '1234501'],
  },
  {
    url: 'https://www.gelbeseiten.de/gsbiz/barbier-am-seltersweg-giessen',
    title: 'Barbier am Seltersweg, Gießen | Gelbe Seiten',
    snippet: 'Seltersweg 12, 35390 Gießen — Friseure',
    keywords: ['barbier', 'seltersweg', 'giessen'],
  },
  {
    url: 'https://www.gelbeseiten.de/gsbiz/haarstudio-melek-giessen',
    title: 'Haarstudio Melek, Gießen | Gelbe Seiten',
    snippet: 'Bahnhofstraße 44, 35390 Gießen — Friseursalon',
    keywords: ['haarstudio', 'melek', 'giessen', '1234502'],
  },
  {
    url: 'https://www.dasoertliche.de/giessen/haarstudio-melek',
    title: 'Haarstudio Melek Gießen - Das Örtliche',
    snippet: 'Adresse und Telefonnummer von Haarstudio Melek in Gießen.',
    keywords: ['haarstudio', 'melek', 'giessen'],
  },
  {
    url: 'https://www.facebook.com/cutandshavegiessen',
    title: 'Cut & Shave Gießen | Facebook',
    snippet: 'Ludwigsplatz 3, Gießen. Barbershop.',
    keywords: ['cut', 'shave', 'giessen'],
  },
  {
    url: 'https://davinci-giessen.de/',
    title: 'Ristorante Da Vinci Gießen',
    snippet: 'Marktplatz 7, 35390 Gießen. Tel 0641 1234507.',
    keywords: ['da', 'vinci', 'ristorante', 'giessen', '1234507'],
  },
  {
    url: 'https://www.lieferando.de/speisekarte/da-vinci-pizzeria-giessen',
    title: 'Da Vinci Pizzeria, Gießen — Lieferando',
    snippet: 'Frankfurter Straße 100, 35392 Gießen. Pizza bestellen.',
    keywords: ['da', 'vinci', 'pizzeria', 'giessen', '1234508'],
  },
  {
    url: 'https://kaiser-barber.de/',
    title: 'Barbershop Kaiser Frankfurt',
    snippet: 'Kaiserstraße 45, 60329 Frankfurt am Main.',
    keywords: ['barbershop', 'kaiser', 'frankfurt', '1234511'],
  },
  {
    url: 'https://www.instagram.com/sultanbarber.ffm',
    title: 'Sultan Barber (@sultanbarber.ffm) • Instagram',
    snippet: 'Münchener Straße 8, Frankfurt.',
    keywords: ['sultan', 'barber', 'frankfurt'],
  },
  {
    url: 'https://cafemilano.de/',
    title: 'Café Milano Frankfurt',
    snippet: 'Berger Straße 120. Frühstück und Kuchen.',
    keywords: ['cafe', 'milano', 'frankfurt', '1234513'],
  },
  {
    url: 'https://bellanapoli-ffm.de/',
    title: 'Bella Napoli — Pizzeria',
    snippet: 'Kaiserstraße 10, 63065 Offenbach am Main. Tel 069 1234517.',
    keywords: ['bella', 'napoli', 'pizzeria', 'offenbach', 'frankfurt', '1234517'],
  },
  {
    url: 'https://elektro-schmidt.de/',
    title: 'Elektro Schmidt GmbH Frankfurt',
    snippet: 'Elektroinstallation, Hanauer Landstraße 200.',
    keywords: ['elektro', 'schmidt', 'frankfurt', '1234515'],
  },
  {
    url: 'https://www.fitnesspoint-ffm.de/',
    title: 'Fitness Point Frankfurt',
    snippet: 'Hanauer Landstraße 5, 60314 Frankfurt.',
    keywords: ['fitness', 'point', 'frankfurt', '1234516'],
  },
  {
    url: 'https://www.11880.com/branchenbuch/giessen/nagelstudio-lotus',
    title: 'Nagelstudio Lotus Gießen — 11880',
    snippet: 'Neustadt 15, 35390 Gießen.',
    keywords: ['nagelstudio', 'lotus', 'giessen'],
  },
];

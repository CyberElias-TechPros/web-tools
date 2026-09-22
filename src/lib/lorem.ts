/**
 * Placeholder text generation with a seedable PRNG: classic lorem ipsum,
 * plain English, tech jargon and a "hipster" flavour. Also produces fake
 * structured data (names, emails, addresses) for mock-ups.
 */

export type LoremFlavor = 'lorem' | 'english' | 'tech' | 'hipster' | 'legal';
export type LoremUnit = 'paragraphs' | 'sentences' | 'words';

const LOREM_WORDS = `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus vestibulum ante primis faucibus orci luctus ultrices posuere cubilia curae donec vitae sapien libero nunc egestas felis mauris tortor auctor a ornare odio pellentesque habitant morbi tristique senectus netus malesuada fames turpis integer euismod ligula porta rhoncus fusce vulputate eleifend aenean massa cum sociis natoque penatibus magnis dis parturient montes nascetur ridiculus mus`.split(/\s+/);

const ENGLISH_WORDS = `the quick brown fox jumps over a lazy dog while morning light spills across quiet rooftops and small birds gather on wires to trade news of the day people walk slowly past shop windows holding warm cups and thinking about nothing in particular somewhere a train hums along its track carrying letters plans and half finished ideas toward a city that never quite sleeps clouds drift apart the wind changes and for a moment everything feels perfectly arranged as if someone had planned the whole scene with great care and then forgot to tell anyone`.split(/\s+/);

const TECH_WORDS = `scalable microservice pipeline latency throughput idempotent cache kubernetes container observability rollout deploy stateless webhook payload schema migration replica shard consensus queue backlog sprint refactor monolith serverless edge runtime bundle tree-shaking hydration render throttle debounce token endpoint retry backoff sandbox telemetry dashboard regression benchmark compile optimize allocation heap garbage collector mutex thread async await promise stream buffer socket handshake certificate encrypt hash checksum`.split(/\s+/);

const HIPSTER_WORDS = `artisan kombucha vinyl sustainable single-origin cold-brew fixie tote bag succulent sourdough kale flannel typewriter polaroid mustache raw denim beard oil pour-over bespoke locavore farm-to-table heirloom tattooed aesthetic gentrify roof party chambray pop-up literally mixtape banjo cardigan brunch matcha ethical hand-poured small-batch craft pickled quinoa vegan sriracha selvage woke tumeric normcore vaporwave lo-fi`.split(/\s+/);

const LEGAL_WORDS = `whereas hereinafter party parties agreement shall notwithstanding pursuant thereto herein foregoing indemnify hold harmless covenant warrant represent jurisdiction governing law severability waiver assignment counterpart binding successors assigns confidential proprietary term termination breach remedy liability consequential damages arbitration venue effective date executed witness signatory undersigned consideration obligations performance material default notice cure period`.split(/\s+/);

const WORD_LISTS: Record<LoremFlavor, string[]> = { lorem: LOREM_WORDS, english: ENGLISH_WORDS, tech: TECH_WORDS, hipster: HIPSTER_WORDS, legal: LEGAL_WORDS };

export const CLASSIC_OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

/** Mulberry32 — tiny, good enough for placeholder text. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface LoremOptions {
  flavor: LoremFlavor;
  unit: LoremUnit;
  count: number;
  startWithClassic: boolean;
  seed?: number;
  html?: boolean;
}

function pick<T>(rng: () => number, list: T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

function sentence(rng: () => number, words: string[]): string {
  const len = 6 + Math.floor(rng() * 12);
  const parts: string[] = [];
  for (let i = 0; i < len; i++) parts.push(pick(rng, words));
  // Occasionally add a comma clause.
  if (len > 9 && rng() > 0.5) {
    const at = 3 + Math.floor(rng() * (len - 6));
    parts[at] = `${parts[at]},`;
  }
  const text = parts.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1) + (rng() > 0.92 ? '?' : rng() > 0.95 ? '!' : '.');
}

function paragraph(rng: () => number, words: string[]): string {
  const len = 3 + Math.floor(rng() * 5);
  const out: string[] = [];
  for (let i = 0; i < len; i++) out.push(sentence(rng, words));
  return out.join(' ');
}

export function generateLorem(options: LoremOptions): string {
  const rng = createRng(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const words = WORD_LISTS[options.flavor];
  const count = Math.max(1, Math.min(500, Math.floor(options.count)));
  let items: string[] = [];
  if (options.unit === 'words') {
    for (let i = 0; i < count; i++) items.push(pick(rng, words));
    let text = items.join(' ');
    if (options.startWithClassic && options.flavor === 'lorem') {
      const classic = CLASSIC_OPENING.replace(/[.,]/g, '').toLowerCase().split(' ');
      text = [...classic, ...items].slice(0, count).join(' ');
    }
    return text.charAt(0).toUpperCase() + text.slice(1) + '.';
  }
  if (options.unit === 'sentences') {
    for (let i = 0; i < count; i++) items.push(sentence(rng, words));
    if (options.startWithClassic && options.flavor === 'lorem') items[0] = CLASSIC_OPENING;
    return items.join(' ');
  }
  for (let i = 0; i < count; i++) items.push(paragraph(rng, words));
  if (options.startWithClassic && options.flavor === 'lorem') items[0] = `${CLASSIC_OPENING} ${items[0]!.split('. ').slice(1).join('. ')}`.trim();
  items = items.map((p) => (p.endsWith('.') || p.endsWith('!') || p.endsWith('?') ? p : `${p}.`));
  if (options.html) return items.map((p) => `<p>${p}</p>`).join('\n');
  return items.join('\n\n');
}

/* -------------------------------------------------------------------------- */
/* Fake structured data                                                       */
/* -------------------------------------------------------------------------- */

const FIRST = ['Amara', 'Ben', 'Chloe', 'Dmitri', 'Elena', 'Farid', 'Grace', 'Hiro', 'Ines', 'Jonas', 'Kofi', 'Leila', 'Mateo', 'Nadia', 'Oscar', 'Priya', 'Quinn', 'Rosa', 'Samir', 'Tara', 'Uma', 'Viktor', 'Wren', 'Ximena', 'Yusuf', 'Zoe'];
const LAST = ['Adeyemi', 'Brooks', 'Chen', 'Dubois', 'Eriksen', 'Fischer', 'Garcia', 'Haddad', 'Ivanova', 'Jensen', 'Kim', 'Lopez', 'Moreau', 'Nakamura', 'Okafor', 'Patel', 'Quinlan', 'Rossi', 'Silva', 'Tanaka', 'Usman', 'Varga', 'Walsh', 'Xu', 'Yilmaz', 'Zhang'];
const STREETS = ['Maple', 'Harbor', 'Cedar', 'Station', 'Willow', 'Market', 'Orchard', 'Bridge', 'Meadow', 'Summit', 'Elm', 'Lake'];
const STREET_TYPES = ['Street', 'Avenue', 'Road', 'Lane', 'Drive', 'Court', 'Way', 'Place'];
const CITIES = ['Lagos', 'Lisbon', 'Austin', 'Toronto', 'Nairobi', 'Berlin', 'Osaka', 'Melbourne', 'Denver', 'Dublin', 'Accra', 'Oslo'];
const COMPANIES = ['Northwind', 'Lumen Labs', 'Blue Harbor', 'Atlas Works', 'Quill & Co', 'Halcyon', 'Bright Fields', 'Vertex Studio', 'Copperline', 'Meridian'];
const DOMAINS = ['example.com', 'example.org', 'mail.test', 'company.example', 'inbox.example'];

export interface FakePerson {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  address: { street: string; city: string; postcode: string; country: string };
  birthDate: string;
  avatarSeed: string;
}

const JOBS = ['Product Designer', 'Software Engineer', 'Data Analyst', 'Marketing Lead', 'Operations Manager', 'Customer Success', 'Accountant', 'UX Researcher', 'DevOps Engineer', 'Content Strategist'];
const COUNTRIES = ['Nigeria', 'Portugal', 'United States', 'Canada', 'Kenya', 'Germany', 'Japan', 'Australia', 'Ireland', 'Ghana', 'Norway'];

export function fakePerson(rng: () => number, index: number): FakePerson {
  const firstName = pick(rng, FIRST);
  const lastName = pick(rng, LAST);
  const year = 1960 + Math.floor(rng() * 45);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    id: String(index + 1),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${firstName}.${lastName}${rng() > 0.7 ? Math.floor(rng() * 90 + 10) : ''}@${pick(rng, DOMAINS)}`.toLowerCase(),
    phone: `+1 ${Math.floor(200 + rng() * 799)} ${pad(Math.floor(rng() * 100))}${Math.floor(rng() * 10)} ${String(Math.floor(rng() * 10000)).padStart(4, '0')}`,
    company: pick(rng, COMPANIES),
    jobTitle: pick(rng, JOBS),
    address: {
      street: `${Math.floor(1 + rng() * 999)} ${pick(rng, STREETS)} ${pick(rng, STREET_TYPES)}`,
      city: pick(rng, CITIES),
      postcode: String(Math.floor(10000 + rng() * 89999)),
      country: pick(rng, COUNTRIES),
    },
    birthDate: `${year}-${pad(month)}-${pad(day)}`,
    avatarSeed: `${firstName}${lastName}${index}`,
  };
}

export function fakePeople(count: number, seed = 42): FakePerson[] {
  const rng = createRng(seed);
  return Array.from({ length: Math.max(1, Math.min(1000, count)) }, (_, i) => fakePerson(rng, i));
}

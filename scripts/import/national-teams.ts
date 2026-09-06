/** Stable FIFA-style codes and Norwegian display names used by both importers. */
export const NATIONAL_TEAMS: Record<string, { en: string; nb: string; aliases?: string[] }> = {
  ALB: { en: "Albania", nb: "Albania" },
  ALG: { en: "Algeria", nb: "Algerie" },
  AND: { en: "Andorra", nb: "Andorra" },
  ARG: { en: "Argentina", nb: "Argentina" },
  ARM: { en: "Armenia", nb: "Armenia" },
  AUS: { en: "Australia", nb: "Australia" },
  AUT: { en: "Austria", nb: "Østerrike" },
  AZE: { en: "Azerbaijan", nb: "Aserbajdsjan" },
  BEL: { en: "Belgium", nb: "Belgia" },
  BIH: { en: "Bosnia and Herzegovina", nb: "Bosnia-Hercegovina", aliases: ["Bosnia-Herzegovina"] },
  BLR: { en: "Belarus", nb: "Hviterussland" },
  BRA: { en: "Brazil", nb: "Brasil" },
  BUL: { en: "Bulgaria", nb: "Bulgaria" },
  CAN: { en: "Canada", nb: "Canada" },
  CHI: { en: "Chile", nb: "Chile" },
  CHN: { en: "China PR", nb: "Kina", aliases: ["China"] },
  CIV: { en: "Ivory Coast", nb: "Elfenbenskysten", aliases: ["Côte d'Ivoire", "Cote d'Ivoire"] },
  CMR: { en: "Cameroon", nb: "Kamerun" },
  COL: { en: "Colombia", nb: "Colombia" },
  CRC: { en: "Costa Rica", nb: "Costa Rica" },
  CRO: { en: "Croatia", nb: "Kroatia" },
  CYP: { en: "Cyprus", nb: "Kypros" },
  CZE: { en: "Czech Republic", nb: "Tsjekkia", aliases: ["Czechia"] },
  DEN: { en: "Denmark", nb: "Danmark" },
  ECU: { en: "Ecuador", nb: "Ecuador" },
  EGY: { en: "Egypt", nb: "Egypt" },
  ENG: { en: "England", nb: "England" },
  ESP: { en: "Spain", nb: "Spania" },
  EST: { en: "Estonia", nb: "Estland" },
  FIN: { en: "Finland", nb: "Finland" },
  FRA: { en: "France", nb: "Frankrike" },
  FRO: { en: "Faroe Islands", nb: "Færøyene" },
  GEO: { en: "Georgia", nb: "Georgia" },
  GER: { en: "Germany", nb: "Tyskland", aliases: ["West Germany", "Vest-Tyskland"] },
  GHA: { en: "Ghana", nb: "Ghana" },
  GIB: { en: "Gibraltar", nb: "Gibraltar" },
  GRE: { en: "Greece", nb: "Hellas" },
  HUN: { en: "Hungary", nb: "Ungarn" },
  IRL: { en: "Republic of Ireland", nb: "Irland", aliases: ["Ireland"] },
  IRQ: { en: "Iraq", nb: "Irak" },
  ISL: { en: "Iceland", nb: "Island" },
  ISR: { en: "Israel", nb: "Israel" },
  ITA: { en: "Italy", nb: "Italia" },
  JAM: { en: "Jamaica", nb: "Jamaica" },
  JPN: { en: "Japan", nb: "Japan" },
  KAZ: { en: "Kazakhstan", nb: "Kasakhstan" },
  KOR: { en: "South Korea", nb: "Sør-Korea", aliases: ["Korea Republic"] },
  KSA: { en: "Saudi Arabia", nb: "Saudi-Arabia" },
  KUW: { en: "Kuwait", nb: "Kuwait" },
  LVA: { en: "Latvia", nb: "Latvia" },
  LIE: { en: "Liechtenstein", nb: "Liechtenstein" },
  LTU: { en: "Lithuania", nb: "Litauen" },
  LUX: { en: "Luxembourg", nb: "Luxembourg" },
  MAR: { en: "Morocco", nb: "Marokko" },
  MDA: { en: "Moldova", nb: "Moldova" },
  MEX: { en: "Mexico", nb: "Mexico" },
  MKD: { en: "North Macedonia", nb: "Nord-Makedonia", aliases: ["Macedonia", "Makedonia"] },
  MLT: { en: "Malta", nb: "Malta" },
  MNE: { en: "Montenegro", nb: "Montenegro" },
  NED: { en: "Netherlands", nb: "Nederland", aliases: ["Holland"] },
  NGA: { en: "Nigeria", nb: "Nigeria" },
  NIR: { en: "Northern Ireland", nb: "Nord-Irland" },
  NZL: { en: "New Zealand", nb: "New Zealand" },
  OMA: { en: "Oman", nb: "Oman" },
  PAN: { en: "Panama", nb: "Panama" },
  PER: { en: "Peru", nb: "Peru" },
  POL: { en: "Poland", nb: "Polen" },
  POR: { en: "Portugal", nb: "Portugal" },
  ROU: { en: "Romania", nb: "Romania" },
  RSA: { en: "South Africa", nb: "Sør-Afrika" },
  RUS: { en: "Russia", nb: "Russland" },
  SCO: { en: "Scotland", nb: "Skottland" },
  SEN: { en: "Senegal", nb: "Senegal" },
  SMR: { en: "San Marino", nb: "San Marino" },
  SRB: { en: "Serbia", nb: "Serbia" },
  SUI: { en: "Switzerland", nb: "Sveits" },
  SVK: { en: "Slovakia", nb: "Slovakia" },
  SVN: { en: "Slovenia", nb: "Slovenia" },
  SWE: { en: "Sweden", nb: "Sverige" },
  THA: { en: "Thailand", nb: "Thailand" },
  TUN: { en: "Tunisia", nb: "Tunisia" },
  TUR: { en: "Turkey", nb: "Tyrkia", aliases: ["Türkiye"] },
  UAE: { en: "United Arab Emirates", nb: "De forente arabiske emirater", aliases: ["United Arab Emirates (the)"] },
  UKR: { en: "Ukraine", nb: "Ukraina" },
  URU: { en: "Uruguay", nb: "Uruguay" },
  USA: { en: "United States", nb: "USA", aliases: ["United States of America"] },
  WAL: { en: "Wales", nb: "Wales" },
  YUG: { en: "Yugoslavia", nb: "Jugoslavia", aliases: ["FR Yugoslavia"] },
};

function key(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

const BY_NAME = new Map<string, string>();
for (const [code, team] of Object.entries(NATIONAL_TEAMS)) {
  for (const name of [team.en, team.nb, ...(team.aliases ?? [])]) BY_NAME.set(key(name), code);
}

export function isNorwayTeam(value: string): boolean {
  return /^(nor|norway|norge(?: menn senior a)?)$/i.test(value.trim());
}

export function resolveNationalTeam(value: string): { code: string; nb: string; known: boolean } {
  const name = value.trim();
  const upper = name.toUpperCase();
  const direct = NATIONAL_TEAMS[upper];
  if (direct) return { code: upper, nb: direct.nb, known: true };
  const code = BY_NAME.get(key(name));
  if (code) return { code, nb: NATIONAL_TEAMS[code].nb, known: true };
  const fallback = key(name).replace(/[^a-z0-9]/g, "").slice(0, 3).padEnd(3, "X").toUpperCase();
  return { code: fallback, nb: name, known: false };
}

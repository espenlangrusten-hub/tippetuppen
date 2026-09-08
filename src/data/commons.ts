/**
 * Picking a usable photo out of a Wikimedia Commons search result.
 *
 * Kept apart from the fetching so the judgement calls - is this licence one we may
 * use, who has to be credited, is this file even an image - can be tested without
 * network access, which the build sandbox does not have.
 */

/** Licences that allow commercial reuse. The site carries ads, so nothing else qualifies. */
const ALLOWED = [
  /^cc0/i,
  /^cc[- ]by([- ]sa)?([- ]\d(\.\d)?)?$/i,
  /^public domain/i,
  /^pd([- ]|$)/i,
];

/** Anything naming a restriction is out, however free the licence line looks. */
const REFUSED = [/non[- ]?free/i, /fair use/i, /no ?commercial/i, /\bnc\b/i, /\bnd\b/i, /trademark/i, /personality/i];

export type CommonsMeta = Record<string, { value: string } | undefined>;

export type CommonsCandidate = {
  title: string;
  descriptionUrl: string;
  thumbUrl: string | null;
  mime: string;
  width: number;
  height: number;
  meta: CommonsMeta;
};

/** Commons wraps attribution in markup; a credit line has to read as plain text. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const value = (meta: CommonsMeta, key: string) => (meta[key]?.value ?? "").trim();

export function licenceOf(meta: CommonsMeta): string {
  return plainText(value(meta, "LicenseShortName") || value(meta, "License"));
}

export function creditOf(meta: CommonsMeta): string {
  const artist = plainText(value(meta, "Artist"));
  return artist || plainText(value(meta, "Credit")) || "Ukjent fotograf (Wikimedia Commons)";
}

/** True only for a licence we may reuse commercially and that carries no extra restriction. */
export function isUsable(meta: CommonsMeta): boolean {
  const licence = licenceOf(meta);
  if (!licence) return false;
  const restrictions = plainText(value(meta, "Restrictions"));
  if (restrictions && REFUSED.some((r) => r.test(restrictions))) return false;
  if (REFUSED.some((r) => r.test(licence))) return false;
  return ALLOWED.some((a) => a.test(licence));
}

/**
 * Rank the candidates and return the first that can actually be used: a real raster
 * image, freely licensed, and tall enough to be worth blurring. Portrait-ish shapes
 * come first - a wide crowd shot rarely shows one face.
 */
export function chooseImage(candidates: CommonsCandidate[], minWidth = 500): CommonsCandidate | null {
  const usable = candidates.filter(
    (c) => /^image\/(jpeg|png)$/.test(c.mime) && c.width >= minWidth && c.thumbUrl && isUsable(c.meta),
  );
  if (!usable.length) return null;
  const score = (c: CommonsCandidate) => {
    const ratio = c.height / c.width; // > 1 is portrait
    return (ratio >= 0.9 ? 2 : ratio >= 0.66 ? 1 : 0) * 1000 + Math.min(c.width, 4000) / 1000;
  };
  return usable.slice().sort((a, b) => score(b) - score(a))[0];
}

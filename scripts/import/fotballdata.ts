/**
 * Client for NFF's Fotballdata API (the public face of FIKS).
 *
 * Use requires an agreement with NFF: they own the data in FIKS, and the API needs
 * credentials (cid, cwd, clubId) issued by Fotballdata. Nothing here works without
 * them, and none of it runs in CI by default.
 *
 * The shape is taken from the openly published PHP SDK at github.com/mentisy/fotballdata:
 *   https://api.fotballdata.no/v1/tournaments/{id}/matches?clubId=&cid=&cwd=&format=json
 *   https://api.fotballdata.no/v1/matches/{id}/peopleandevents?clubId=&cid=&cwd=&format=json
 *
 * Why this matters to us: the Player entity carries PlayerShirtNumber, Position and
 * TeamCaptain — the two fields our own records are weakest on. Wikipedia gives neither
 * a side (only GK/DF/MF/FW) nor a trustworthy number.
 *
 * PRIVACY: match "people" responses include Email and MobilePhone for contacts and
 * players. Those are stripped by `redact` before anything is written to disk, and no
 * raw response is ever committed.
 */

const HOST = "https://api.fotballdata.no/v1";

export type Credentials = { clubId: string; cid: string; cwd: string };

/**
 * Personal contact details we must never keep. Matched as a substring, not a whole
 * field name: the API prefixes them by role, so a match carries HomeTeamContactPersonEmail
 * and RefereeMobilePhone alongside a player's bare Email. Nothing we want — names,
 * shirt numbers, positions, goals, dates — contains any of these words.
 */
const PERSONAL_FIELDS = /(e-?mail|phone|address|birth|personalid|fodselsnummer)/i;

/** Recursively drop contact details from an API response. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PERSONAL_FIELDS.test(k)) continue;
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

/** Build a request URL. Credentials go in the query string, as the API expects. */
export function endpointUrl(path: string, creds: Credentials): string {
  const url = new URL(`${HOST}/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("clubId", creds.clubId);
  url.searchParams.set("cid", creds.cid);
  url.searchParams.set("cwd", creds.cwd);
  url.searchParams.set("format", "json");
  return url.toString();
}

/** Credentials never appear in logs or error messages. */
export function safeLabel(url: string): string {
  const u = new URL(url);
  for (const key of ["cid", "cwd", "clubId"]) if (u.searchParams.has(key)) u.searchParams.set(key, "…");
  return u.toString();
}

export function credentialsFromEnv(env: Record<string, string | undefined> = process.env): Credentials {
  const clubId = env.FOTBALLDATA_CLUB_ID;
  const cid = env.FOTBALLDATA_CID;
  const cwd = env.FOTBALLDATA_CWD;
  if (!clubId || !cid || !cwd) {
    throw new Error("Set FOTBALLDATA_CLUB_ID, FOTBALLDATA_CID and FOTBALLDATA_CWD (issued by Fotballdata under the NFF agreement).");
  }
  return { clubId, cid, cwd };
}

export async function get(path: string, creds: Credentials): Promise<unknown> {
  const url = endpointUrl(path, creds);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${safeLabel(url)}`);
  return redact(await res.json());
}

export const paths = {
  tournamentMatches: (tournamentId: number | string) => `tournaments/${tournamentId}/matches`,
  matchPeopleAndEvents: (matchId: number | string) => `matches/${matchId}/peopleandevents`,
};

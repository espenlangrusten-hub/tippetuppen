/**
 * The contact form's rules, shared by the page and the Edge Function.
 *
 * One copy, synced to supabase/functions/_shared, so the browser can never accept a
 * message the server then refuses - or the other way round, which is worse: a form that
 * says "sendt" for something that was dropped.
 */
export const CONTACT_LIMITS = {
  title: { min: 3, max: 120 },
  message: { min: 10, max: 4000 },
  sender: { max: 200 },
} as const;

/** Messages one visitor may send per day before the form asks them to wait. */
export const CONTACT_PER_DAY = 5;

export type ContactInput = { title: string; message: string; sender: string };
export type ContactField = keyof ContactInput;
export type ContactCheck =
  | { ok: true; value: ContactInput }
  | { ok: false; errors: Partial<Record<ContactField, string>> };

// Deliberately loose: one @, something on each side, a dot in the domain. Stricter
// patterns reject real addresses (plus-tags, long TLDs, IDN) far more often than they
// catch typos, and the only use of this address is to reply to it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim, collapse the title to one line, and say what is wrong with each field. */
export function checkContact(raw: Partial<Record<ContactField, unknown>>): ContactCheck {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  // A subject line with a newline in it is how header injection starts; the title is one
  // line whatever the browser sent.
  const title = str(raw.title).replace(/\s+/g, " ").trim();
  const message = str(raw.message).replace(/\r\n/g, "\n").trim();
  const sender = str(raw.sender).trim();

  const errors: Partial<Record<ContactField, string>> = {};
  if (title.length < CONTACT_LIMITS.title.min) errors.title = "Skriv en kort tittel.";
  else if (title.length > CONTACT_LIMITS.title.max) errors.title = `Tittelen kan være på høyst ${CONTACT_LIMITS.title.max} tegn.`;
  if (message.length < CONTACT_LIMITS.message.min) errors.message = "Meldingen er litt for kort.";
  else if (message.length > CONTACT_LIMITS.message.max) errors.message = `Meldingen kan være på høyst ${CONTACT_LIMITS.message.max} tegn.`;
  if (!sender) errors.sender = "Skriv e-postadressen din, så vi kan svare.";
  else if (sender.length > CONTACT_LIMITS.sender.max || !EMAIL.test(sender)) errors.sender = "Det ser ikke ut som en e-postadresse.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { title, message, sender } };
}

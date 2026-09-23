import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkContact, CONTACT_LIMITS } from "@/lib/contact";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const ok = { title: "Feil i oppstilling", message: "Kampen mot Italia i 1991 mangler Flo.", sender: "ola@example.no" };

describe("kontaktskjemaet sjekker det samme i nettleseren og på serveren", () => {
  it("godtar en vanlig melding og rydder den", () => {
    const r = checkContact({ title: "  Feil   i\noppstilling ", message: "  hei, dette er en melding\r\n ", sender: " ola@example.no " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // A subject line with a newline in it is how header injection starts.
      expect(r.value.title).toBe("Feil i oppstilling");
      expect(r.value.message).toBe("hei, dette er en melding");
      expect(r.value.sender).toBe("ola@example.no");
    }
  });

  it("sier hva som er galt med hvert felt", () => {
    const r = checkContact({ title: "", message: "kort", sender: "ikke-en-adresse" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["message", "sender", "title"]);
  });

  it("godtar adresser strenge mønstre avviser", () => {
    for (const sender of ["ola+tippe@example.no", "o.nordmann@sub.domene.museum", "kari@xn--bl-2ia.no"])
      expect(checkContact({ ...ok, sender }).ok, sender).toBe(true);
  });

  it("holder lengdene serveren håndhever", () => {
    expect(checkContact({ ...ok, title: "x".repeat(CONTACT_LIMITS.title.max + 1) }).ok).toBe(false);
    expect(checkContact({ ...ok, message: "x".repeat(CONTACT_LIMITS.message.max + 1) }).ok).toBe(false);
    expect(checkContact({ ...ok, sender: `${"a".repeat(CONTACT_LIMITS.sender.max)}@b.no` }).ok).toBe(false);
  });

  it("tåler at feltene ikke er tekst i det hele tatt", () => {
    expect(checkContact({ title: 42, message: null, sender: {} }).ok).toBe(false);
  });

  it("er samme fil på begge sider", () => {
    const shared = read("supabase", "functions", "_shared", "contact.ts");
    expect(shared).toContain("export function checkContact");
    expect(read("scripts", "sync-shared.ts")).toContain('"contact.ts"');
  });
});

describe("kontaktruten", () => {
  const route = read("supabase", "functions", "_shared", "contact-routes.ts");

  it("lagrer meldingen før den prøver å sende e-post", () => {
    // Stored first: a message that only ever existed as an outgoing email is lost the
    // first time the mail provider is down or not configured.
    expect(route.indexOf("insert into tippetuppen.contact_messages")).toBeLessThan(route.indexOf("await mail("));
  });

  it("gir en bot som fyller ut honningfella samme svar som et menneske, og lagrer ingenting", () => {
    const trap = route.indexOf("body.website");
    expect(trap).toBeGreaterThan(-1);
    expect(trap).toBeLessThan(route.indexOf("insert into tippetuppen.contact_messages"));
  });

  it("begrenser antall meldinger per besøkende", () => {
    expect(route).toContain("CONTACT_PER_DAY");
    expect(route).toContain('error: "rate-limit"');
  });

  it("holder løftet i personvernerklæringen om sletting etter 12 måneder", () => {
    expect(route).toContain("interval '12 months'");
    expect(read("src", "app", "personvern", "page.tsx")).toContain("slettes automatisk etter 12 måneder");
  });

  it("henter mottakeren fra en hemmelighet, ikke fra koden", () => {
    // The repository is public. An address committed here is harvested by every crawler
    // that reads GitHub.
    expect(route).toContain('Deno.env.get("CONTACT_TO")');
    const tracked = execSync("git ls-files supabase src scripts", { encoding: "utf8" }).split("\n").filter(Boolean);
    const withAddress = tracked.filter((f) => /proton\.me/i.test(readFileSync(f, "utf8")));
    expect(withAddress).toEqual([]);
  });

  it("slår på radnivåsikkerhet for tabellen med avsenderadresser", () => {
    const migration = execSync("ls drizzle/*.sql", { encoding: "utf8" }).split("\n").filter((f) => f && readFileSync(f, "utf8").includes('CREATE TABLE "tippetuppen"."contact_messages"'))[0];
    expect(readFileSync(migration, "utf8")).toContain("ALTER TABLE tippetuppen.contact_messages ENABLE ROW LEVEL SECURITY");
  });
});

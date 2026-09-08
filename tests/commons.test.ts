import { describe, it, expect } from "vitest";
import { chooseImage, creditOf, isUsable, licenceOf, plainText, type CommonsCandidate } from "@/data/commons";

const meta = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

const candidate = (o: Partial<CommonsCandidate> & { meta: CommonsCandidate["meta"] }): CommonsCandidate => ({
  title: "File:X.jpg",
  descriptionUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
  thumbUrl: "https://upload.wikimedia.org/x/800px-X.jpg",
  mime: "image/jpeg",
  width: 1200,
  height: 1600,
  ...o,
});

describe("reading Commons metadata", () => {
  it("turns the markup Commons stores into a plain credit line", () => {
    expect(plainText('<a href="/wiki/User:Foo" title="User:Foo">Foo Bar</a>')).toBe("Foo Bar");
    expect(creditOf(meta({ Artist: "<span>Kari Nordmann</span>" }))).toBe("Kari Nordmann");
    // Nothing named still has to produce something a reader can see.
    expect(creditOf(meta({}))).toMatch(/Wikimedia Commons/);
  });

  it("reads the licence name", () => {
    expect(licenceOf(meta({ LicenseShortName: "CC BY-SA 4.0" }))).toBe("CC BY-SA 4.0");
  });
});

describe("which licences we may actually use", () => {
  // The site carries ads, so anything barring commercial use is off limits however
  // freely it is described.
  it("accepts the free ones", () => {
    for (const l of ["CC0", "CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 4.0", "Public domain", "PD-old"]) {
      expect(isUsable(meta({ LicenseShortName: l })), l).toBe(true);
    }
  });

  it("refuses non-commercial, no-derivatives and non-free", () => {
    for (const l of ["CC BY-NC 4.0", "CC BY-ND 4.0", "Fair use", "Non-free logo", "CC BY-NC-SA 3.0"]) {
      expect(isUsable(meta({ LicenseShortName: l })), l).toBe(false);
    }
  });

  it("refuses a free licence that carries a restriction", () => {
    expect(isUsable(meta({ LicenseShortName: "CC BY-SA 4.0", Restrictions: "trademarked" }))).toBe(false);
  });

  it("refuses a file with no licence at all", () => {
    expect(isUsable(meta({}))).toBe(false);
  });
});

describe("choosing between candidates", () => {
  it("prefers a portrait over a wide shot", () => {
    const wide = candidate({ title: "File:Crowd.jpg", width: 3000, height: 1000, meta: meta({ LicenseShortName: "CC BY 4.0" }) });
    const portrait = candidate({ title: "File:Face.jpg", width: 900, height: 1200, meta: meta({ LicenseShortName: "CC BY 4.0" }) });
    expect(chooseImage([wide, portrait])?.title).toBe("File:Face.jpg");
  });

  it("skips anything unusable, whatever its shape", () => {
    const nonFree = candidate({ width: 2000, height: 2600, meta: meta({ LicenseShortName: "Fair use" }) });
    const svg = candidate({ mime: "image/svg+xml", meta: meta({ LicenseShortName: "CC0" }) });
    const tiny = candidate({ width: 120, height: 160, meta: meta({ LicenseShortName: "CC0" }) });
    const noThumb = candidate({ thumbUrl: null, meta: meta({ LicenseShortName: "CC0" }) });
    expect(chooseImage([nonFree, svg, tiny, noThumb])).toBeNull();
  });

  it("returns nothing rather than something unusable", () => {
    expect(chooseImage([])).toBeNull();
  });
});

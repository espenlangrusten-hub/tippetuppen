import { describe, it, expect } from "vitest";
import { redact, endpointUrl, safeLabel, credentialsFromEnv, paths } from "../scripts/import/fotballdata";

const creds = { clubId: "69", cid: "666", cwd: "hemmelig" };

describe("fotballdata client", () => {
  it("builds the URL the API expects", () => {
    const url = endpointUrl(paths.matchPeopleAndEvents(123), creds);
    expect(url).toBe("https://api.fotballdata.no/v1/matches/123/peopleandevents?clubId=69&cid=666&cwd=hemmelig&format=json");
    expect(endpointUrl(paths.tournamentMatches(39899), creds)).toContain("/v1/tournaments/39899/matches?");
  });

  it("keeps credentials out of anything it prints", () => {
    const label = safeLabel(endpointUrl(paths.matchPeopleAndEvents(1), creds));
    expect(label).not.toContain("hemmelig");
    expect(label).not.toContain("666");
    expect(label).toContain("/matches/1/peopleandevents");
  });

  it("refuses to run without credentials, naming what is missing", () => {
    expect(() => credentialsFromEnv({})).toThrow(/FOTBALLDATA_CLUB_ID/);
    expect(() => credentialsFromEnv({ FOTBALLDATA_CLUB_ID: "1", FOTBALLDATA_CID: "2" })).toThrow();
    expect(credentialsFromEnv({ FOTBALLDATA_CLUB_ID: "1", FOTBALLDATA_CID: "2", FOTBALLDATA_CWD: "3" })).toEqual({ clubId: "1", cid: "2", cwd: "3" });
  });

  // The API returns contact details for players and team staff. None of it is ours to keep.
  it("strips contact details at every depth, keeping the football", () => {
    const response = {
      MatchId: 1,
      HomeTeamContactPersonEmail: "kontakt@klubb.no",
      HomeTeamContactPersonMobilePhone: "99887766",
      HomeTeamPlayers: [
        { FirstName: "Erling", SurName: "Haaland", PlayerShirtNumber: 9, Position: "Spiss", TeamCaptain: false, Email: "e@example.com", MobilePhone: "12345678" },
      ],
      Events: [{ Minute: 63, Person: { FirstName: "Antonio", SurName: "Nusa", Email: "a@example.com" } }],
    };
    const clean = JSON.parse(JSON.stringify(redact(response)));
    const serialised = JSON.stringify(clean);
    expect(serialised).not.toContain("@");
    expect(serialised).not.toContain("99887766");
    expect(serialised).not.toContain("12345678");
    // …and everything we actually came for survives.
    expect(clean.HomeTeamPlayers[0]).toEqual({ FirstName: "Erling", SurName: "Haaland", PlayerShirtNumber: 9, Position: "Spiss", TeamCaptain: false });
    expect(clean.Events[0].Person).toEqual({ FirstName: "Antonio", SurName: "Nusa" });
    expect(clean.MatchId).toBe(1);
  });
});

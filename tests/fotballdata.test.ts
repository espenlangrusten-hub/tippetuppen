import { describe, it, expect } from "vitest";
import { redact, endpointUrl, safeLabel, credentialsFromEnv, paths } from "../scripts/import/fotballdata";
import { buildFotballdataDraft, fotballdataDate, summariseTournament, tournamentMatches } from "../scripts/import/fotballdata-shape";

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

describe("fotballdata response parser", () => {
  const players = [
    ["Keeper", "Ørjan", "Nyland", 1],
    ["Forsvar", "Julian", "Ryerson", 14],
    ["Forsvar", "Kristoffer", "Ajer", 3],
    ["Forsvar", "Leo", "Østigård", 4],
    ["Forsvar", "David", "Wolfe", 5],
    ["Midtbane", "Sander", "Berge", 8],
    ["Midtbane", "Patrick", "Berg", 6],
    ["Midtbane", "Martin", "Ødegaard", 10],
    ["Angrep", "Antonio", "Nusa", 20],
    ["Angrep", "Alexander", "Sørloth", 7],
    ["Angrep", "Erling", "Haaland", 9],
    ["Reserve", "Hugo", "Vetlesen", 18],
  ].map(([Position, FirstName, SurName, PlayerShirtNumber], index) => ({
    Position,
    PositionId: Position === "Reserve" ? 112 : undefined,
    FirstName,
    SurName,
    PlayerShirtNumber,
    TeamCaptain: FirstName === "Martin",
    SortOrder: index,
  }));
  const summary = {
    MatchId: 9001,
    MatchStartDate: "/Date(1710000000000-0000)/",
    HomeTeamId: 47,
    HomeTeamName: "Norge",
    HomeTeamGoals: 2,
    AwayTeamId: 48,
    AwayTeamName: "Sverige",
    AwayTeamGoals: 1,
    StadiumName: "Ullevaal Stadion",
  };
  const detail = {
    ...summary,
    HomeTeamPlayers: players,
    AwayTeamPlayers: [],
    MatchEventList: [
      { MatchEventTypeId: 6, MatchEventType: "Spillemål", TeamId: 47, PlayerName: "Erling Haaland", Minute: 12 },
      { MatchEventTypeId: 14, MatchEventType: "Straffemål", TeamId: 47, PlayerName: "Martin Ødegaard", Minute: 41 },
      { MatchEventTypeId: 6, MatchEventType: "Spillemål", TeamId: 48, PlayerName: "Viktor Gyökeres", Minute: 77 },
    ],
  };

  it("unwraps tournament responses instead of assuming a bare array", () => {
    const response = { Matches: [summary, { ...summary, MatchId: 9002, MatchStartDate: "/Date(1711000000000-0000)/" }] };
    expect(tournamentMatches(response)).toHaveLength(2);
    expect(summariseTournament(response)).toMatchObject({ count: 2, ids: [9001, 9002] });
  });

  it("normalises the API date wrapper", () => {
    expect(fotballdataDate("/Date(1650565800000-0000)/")).toBe("2022-04-21");
    expect(fotballdataDate("2025-11-13T20:45:00")).toBe("2025-11-13");
  });

  it("builds a complete, conservative NFF match without inventing detailed positions", () => {
    const draft = buildFotballdataDraft(summary, detail, "2026-09-05");
    expect(draft).toMatchObject({
      competition: "international",
      opponent: "Sverige",
      opponentCode: "SWE",
      norwayHome: true,
      score: [2, 1],
      status: "single_source",
      formation: "4-3-3",
      goalsPartial: false,
    });
    expect(draft?.lineup).toHaveLength(11);
    expect(draft?.lineup.filter((player) => player.pos === "DF")).toHaveLength(4);
    expect(draft?.lineup.find((player) => player.name === "Martin Ødegaard")).toMatchObject({ captain: true, no: 10, pos: "MF" });
    expect(draft?.goals).toHaveLength(3);
    expect(JSON.stringify(draft)).not.toContain("Reserve");
    expect(draft?.sources[0].url).toContain("fiksId=9001");
  });

  it("quarantines incomplete lineups for review", () => {
    const draft = buildFotballdataDraft(summary, { ...detail, HomeTeamPlayers: players.slice(0, 10) });
    expect(draft?.status).toBe("uncertain");
    expect(draft?.notes).toContain("ikke 11");
  });
});

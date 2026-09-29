"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { clearSession, storedUser, updateStoredUser, type SessionUser } from "@/lib/auth";
import { monthCopy, type Champion, type LeagueMonth } from "@/lib/monthlyLeague";
import { BASE_PATH } from "@/lib/site";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { MonthChampion, MonthPulse } from "./MonthChampion";

const SHOW_REGISTERED_FROM = 100;

type Row = {
  rank: number;
  username: string;
  avatar_id: number | null;
  points: number;
  played: number;
  maalloes_total: number;
  xi_solved: number;
  finn_points: number;
};

type FriendLeagueSummary = {
  id: string;
  name: string;
  code: string;
  ownerUserId: string;
  ownerUsername: string;
  memberCount: number;
  isOwner: boolean;
};

type FriendRow = {
  rank: number;
  userId: string;
  username: string;
  avatarId: number | null;
  points: number;
  played: number;
  maalloesTotal: number;
  xiSolved: number;
  finnPoints: number;
};

type FriendLeagueDetail = {
  id: string;
  name: string;
  code: string;
  ownerUserId: string;
  ownerUsername: string;
  isOwner: boolean;
  month: LeagueMonth;
  rows: FriendRow[];
};

export function LeagueScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState<Row | null>(null);
  const [registered, setRegistered] = useState<number | null>(null);
  const [month, setMonth] = useState<{ month: LeagueMonth; champion: Champion } | null>(null);
  const [boardStatus, setBoardStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<"global" | "friends">("global");
  const [friendLeagues, setFriendLeagues] = useState<FriendLeagueSummary[]>([]);
  const [selected, setSelected] = useState<FriendLeagueDetail | null>(null);
  const [friendStatus, setFriendStatus] = useState<"idle" | "loading" | "error">("idle");
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [renameName, setRenameName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const boardRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++boardRequest.current;
    setBoardStatus("loading");
    try {
      const response = await apiGet<{
        ok: boolean;
        rows: Row[];
        me: Row | null;
        registered: number;
        month?: LeagueMonth;
        champion?: Champion;
      }>("/leaderboard");
      if (!response.ok) throw new Error("Leaderboard unavailable");
      if (request !== boardRequest.current) return;
      setRows(response.rows);
      setMe(response.me ?? null);
      setMonth(response.month ? { month: response.month, champion: response.champion ?? null } : null);
      setRegistered(typeof response.registered === "number" ? response.registered : null);
      setBoardStatus("ready");
    } catch {
      if (request === boardRequest.current) setBoardStatus("error");
    }
  }, []);

  const loadFriendList = useCallback(async () => {
    if (!storedUser()) return;
    setFriendStatus("loading");
    try {
      const response = await apiGet<{ ok: boolean; leagues?: FriendLeagueSummary[] }>("/friend-leagues");
      if (!response.ok) throw new Error("friend leagues unavailable");
      setFriendLeagues(response.leagues ?? []);
      setFriendStatus("idle");
    } catch {
      setFriendStatus("error");
    }
  }, []);

  const loadFriend = useCallback(async (code: string) => {
    if (!code) return;
    setFriendStatus("loading");
    setMessage("");
    try {
      const response = await apiGet<{ ok: boolean; league?: FriendLeagueDetail; error?: string }>(
        "/friend-league?code=" + encodeURIComponent(code),
      );
      if (!response.ok || !response.league) throw new Error(response.error ?? "not-found");
      setSelected(response.league);
      setRenameName(response.league.name);
      setFriendStatus("idle");
    } catch {
      setSelected(null);
      setFriendStatus("error");
      setMessage("Fant ikke venneligaen, eller du er ikke medlem.");
    }
  }, []);

  useEffect(() => {
    setUser(storedUser());
    void load();

    const join = new URLSearchParams(window.location.search).get("join");
    if (join) {
      setTab("friends");
      setJoinCode(join.toUpperCase());
    }

    const local = storedUser();
    if (!local) return;
    void apiGet<{ ok: boolean; user?: SessionUser }>("/auth/me")
      .then((response) => {
        if (response.ok && response.user) {
          updateStoredUser(response.user);
          setUser(response.user);
          void loadFriendList();
        } else {
          clearSession();
          setUser(null);
        }
      })
      .catch(() => {});
  }, [load, loadFriendList]);

  useEffect(() => {
    if (tab === "friends" && user) void loadFriendList();
  }, [tab, user, loadFriendList]);

  const createLeague = async (event: FormEvent) => {
    event.preventDefault();
    if (!createName.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPost<{ ok: boolean; league?: FriendLeagueDetail; error?: string }>(
        "/friend-league/create",
        { name: createName },
      );
      if (!response.ok || !response.league) {
        setMessage(response.error === "limit" ? "Du er allerede med i maksimalt antall venneligaer." : "Kunne ikke opprette ligaen.");
        return;
      }
      setCreateName("");
      setSelected(response.league);
      setRenameName(response.league.name);
      await loadFriendList();
      setMessage("Venneliga opprettet. Del koden eller invitasjonslenken med vennene dine.");
    } catch {
      setMessage("Kunne ikke opprette ligaen akkurat nå.");
    } finally {
      setBusy(false);
    }
  };

  const joinLeague = async (event: FormEvent) => {
    event.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPost<{ ok: boolean; league?: FriendLeagueDetail; error?: string }>(
        "/friend-league/join",
        { code: joinCode },
      );
      if (!response.ok || !response.league) {
        setMessage(
          response.error === "not-found"
            ? "Fant ingen venneliga med denne koden."
            : response.error === "limit"
              ? "Du er allerede med i maksimalt antall venneligaer."
              : "Kunne ikke bli med i ligaen.",
        );
        return;
      }
      setSelected(response.league);
      setRenameName(response.league.name);
      setJoinCode(response.league.code);
      await loadFriendList();
      setMessage("Du er med i " + response.league.name + ".");
      window.history.replaceState({}, "", BASE_PATH + "/liga/");
    } catch {
      setMessage("Kunne ikke bli med i ligaen akkurat nå.");
    } finally {
      setBusy(false);
    }
  };

  const mutateLeague = async (
    route: string,
    body: Record<string, unknown>,
    successMessage: string,
    clearOnSuccess = false,
  ) => {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPost<{ ok: boolean; league?: FriendLeagueDetail; error?: string }>(route, body);
      if (!response.ok) {
        setMessage("Kunne ikke utføre endringen.");
        return;
      }
      if (clearOnSuccess) {
        setSelected(null);
      } else if (response.league) {
        setSelected(response.league);
        setRenameName(response.league.name);
      }
      await loadFriendList();
      setMessage(successMessage);
    } catch {
      setMessage("Kunne ikke utføre endringen akkurat nå.");
    } finally {
      setBusy(false);
    }
  };

  const renameLeague = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !renameName.trim()) return;
    await mutateLeague(
      "/friend-league/rename",
      { code: selected.code, name: renameName },
      "Liganavnet er oppdatert.",
    );
  };

  const shareLeague = async () => {
    if (!selected) return;
    const inviteUrl = window.location.origin + BASE_PATH + "/liga/?join=" + encodeURIComponent(selected.code);
    const text = `Bli med i venneligaen «${selected.name}» på Tippetuppen. Kode: ${selected.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: selected.name + " – Tippetuppen", text, url: inviteUrl });
        return;
      }
      await navigator.clipboard.writeText(inviteUrl);
      setMessage("Invitasjonslenken er kopiert.");
    } catch {
      // User cancelling the native share sheet should not be treated as an error.
    }
  };

  const copyCode = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.code);
      setMessage("Ligakoden er kopiert.");
    } catch {
      setMessage("Kode: " + selected.code);
    }
  };

  const copy = month ? monthCopy(month.month, month.champion) : null;

  return (
    <div className="league-reference-page flex flex-col gap-4">
      <section className="league-reference-hero">
        <h1 className="font-display text-4xl font-bold uppercase">Liga og Profil</h1>
        <p className="mt-2 text-mist">
          Følg med på venneligaen, sjekk plasseringen din og administrer profilen din. Fotball er best sammen!
        </p>
      </section>

      <div className="league-reference-tabs flex gap-2">
        <button className={`btn ${tab === "global" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("global")}>
          Topplisten
        </button>
        <button className={`btn ${tab === "friends" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("friends")}>
          Venneligaer
        </button>
      </div>

      {tab === "global" ? (
        <>
          <section className="card overflow-hidden">
            {copy && <MonthChampion copy={copy} />}
            <div className="border-b border-line p-4">
              <h2 className="font-display text-2xl font-bold uppercase">Topp 100 – {copy ? copy.month : "denne måneden"}</h2>
              <p className="text-xs text-mist">
                Tabellen nullstilles den første i hver måned. Mangler XI, Målløs, Finn spilleren og Trener Genius gir hver opptil 100 ligapoeng per dag.
              </p>
            </div>
            {copy && <MonthPulse copy={copy} />}
            {boardStatus === "loading" ? (
              <p className="p-5 text-mist" role="status">Henter ligaen …</p>
            ) : boardStatus === "error" ? (
              <div className="p-5" role="status">
                <p className="text-mist">Kunne ikke hente ligaen.</p>
                <button className="mt-2 underline" onClick={() => void load()}>Prøv igjen</button>
              </div>
            ) : (
              <>
                {rows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-mist">
                        <tr>
                          <th scope="col" className="p-3">#</th>
                          <th scope="col" className="p-3">Spiller</th>
                          <th scope="col" className="p-3 text-right">Poeng</th>
                          <th scope="col" className="p-3 text-right">Spill</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <LeagueRow key={row.username} row={row} own={user?.username === row.username} />
                        ))}
                      </tbody>
                      {user && me && me.username === user.username && me.rank > 100 && (
                        <tfoot className="border-t-2 border-line">
                          <LeagueRow row={me} own />
                        </tfoot>
                      )}
                    </table>
                  </div>
                ) : (
                  <p className="p-5 text-mist">Ingen poeng i {copy ? copy.month : "denne måneden"} ennå. Bli den første på tabellen.</p>
                )}
                {user && !me && (
                  <p className="border-t border-line p-4 text-sm font-bold">
                    {user.username} – ikke rangert ennå. Fullfør dagens spill for å få en plassering.
                  </p>
                )}
              </>
            )}
          </section>
          {!user && (
            <section className="card p-4 text-sm">
              <span className="text-mist">Vil du lagre poeng og delta med egen profil? </span>
              <Link href="/profil/#register" className="font-bold text-gold underline">Opprett spiller</Link>
            </section>
          )}
          {boardStatus === "ready" && registered !== null && registered >= SHOW_REGISTERED_FROM && (
            <div className="text-center text-mist">
              <div className="text-xs uppercase tracking-widest">Registrerte spillere</div>
              <div className="mt-1 font-display text-3xl text-snow">{registered.toLocaleString("nb-NO")}</div>
            </div>
          )}
        </>
      ) : (
        <FriendLeagues
          user={user}
          leagues={friendLeagues}
          selected={selected}
          status={friendStatus}
          createName={createName}
          joinCode={joinCode}
          renameName={renameName}
          message={message}
          busy={busy}
          onCreateName={setCreateName}
          onJoinCode={(value) => setJoinCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
          onRenameName={setRenameName}
          onCreate={createLeague}
          onJoin={joinLeague}
          onSelect={(league) => void loadFriend(league.code)}
          onRename={renameLeague}
          onShare={() => void shareLeague()}
          onCopyCode={() => void copyCode()}
          onRegenerate={() => {
            if (selected && window.confirm("Lage en ny kode? Den gamle invitasjonslenken vil slutte å virke.")) {
              void mutateLeague(
                "/friend-league/regenerate",
                { code: selected.code },
                "Ny ligakode er generert.",
              );
            }
          }}
          onKick={(row) => {
            if (selected && window.confirm("Fjerne " + row.username + " fra ligaen?")) {
              void mutateLeague(
                "/friend-league/kick",
                { code: selected.code, userId: row.userId },
                row.username + " er fjernet fra ligaen.",
              );
            }
          }}
          onLeave={() => {
            if (selected && window.confirm("Forlate " + selected.name + "?")) {
              void mutateLeague(
                "/friend-league/leave",
                { code: selected.code },
                "Du har forlatt venneligaen.",
                true,
              );
            }
          }}
          onDelete={() => {
            if (selected && window.confirm("Slette venneligaen permanent? Dette kan ikke angres.")) {
              void mutateLeague(
                "/friend-league/delete",
                { code: selected.code },
                "Venneligaen er slettet.",
                true,
              );
            }
          }}
        />
      )}
    </div>
  );
}

function LeagueRow({ row, own }: { row: Row; own: boolean }) {
  return (
    <tr className={`border-t border-line ${own ? "bg-sky/10 font-bold" : ""}`} aria-current={own ? "true" : undefined}>
      <td className="p-3 font-display text-lg">{row.rank}</td>
      <td className="p-3">
        <div className="flex min-w-0 items-center gap-2">
          <ProfileAvatar avatarId={row.avatar_id} size={34} />
          <span className="break-all">{row.username}</span>
        </div>
      </td>
      <td className="p-3 text-right font-display text-xl text-gold">{row.points}</td>
      <td className="p-3 text-right text-mist">{row.played}</td>
    </tr>
  );
}

function FriendLeagues(props: {
  user: SessionUser | null;
  leagues: FriendLeagueSummary[];
  selected: FriendLeagueDetail | null;
  status: "idle" | "loading" | "error";
  createName: string;
  joinCode: string;
  renameName: string;
  message: string;
  busy: boolean;
  onCreateName: (value: string) => void;
  onJoinCode: (value: string) => void;
  onRenameName: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onJoin: (event: FormEvent) => void;
  onSelect: (league: FriendLeagueSummary) => void;
  onRename: (event: FormEvent) => void;
  onShare: () => void;
  onCopyCode: () => void;
  onRegenerate: () => void;
  onKick: (row: FriendRow) => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  if (!props.user) {
    return (
      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Venneligaer</h2>
        <p className="mt-2 text-mist">Du må ha Tippetuppen-profil og være logget inn for å opprette eller bli med i en venneliga.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={props.joinCode ? "/profil/?join=" + encodeURIComponent(props.joinCode) + "#login" : "/profil/#login"} className="btn btn-primary">Logg inn</Link>
          <Link href={props.joinCode ? "/profil/?join=" + encodeURIComponent(props.joinCode) + "#register" : "/profil/#register"} className="btn btn-secondary">Opprett profil</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2">
        <form className="card p-5" onSubmit={props.onCreate}>
          <h2 className="font-display text-2xl font-bold uppercase">Opprett venneliga</h2>
          <p className="mt-1 text-sm text-mist">Velg navn. Tippetuppen lager en privat kode automatisk.</p>
          <input
            className="input mt-4"
            value={props.createName}
            onChange={(e) => props.onCreateName(e.target.value)}
            placeholder="F.eks. Monolitten G14"
            maxLength={40}
          />
          <button className="btn btn-primary mt-3 w-full" disabled={props.busy || !props.createName.trim()}>
            Opprett liga
          </button>
        </form>

        <form className="card p-5" onSubmit={props.onJoin}>
          <h2 className="font-display text-2xl font-bold uppercase">Bli med</h2>
          <p className="mt-1 text-sm text-mist">Skriv inn koden du har fått av en venn.</p>
          <input
            className="input mt-4 font-display text-xl uppercase tracking-widest"
            value={props.joinCode}
            onChange={(e) => props.onJoinCode(e.target.value)}
            placeholder="ABC123"
            autoCapitalize="characters"
          />
          <button className="btn btn-secondary mt-3 w-full" disabled={props.busy || !props.joinCode.trim()}>
            Bli med i liga
          </button>
        </form>
      </section>

      {props.message && <p className="card p-3 text-sm text-mist">{props.message}</p>}

      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Mine venneligaer</h2>
        {props.status === "loading" && !props.leagues.length ? (
          <p className="mt-3 text-mist">Henter venneligaer …</p>
        ) : props.leagues.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {props.leagues.map((league) => (
              <button
                type="button"
                key={league.id}
                className={`rounded-xl border p-3 text-left transition ${props.selected?.id === league.id ? "border-gold bg-gold/10" : "border-line hover:border-sky"}`}
                onClick={() => props.onSelect(league)}
              >
                <div className="font-display text-xl font-bold">{league.name}</div>
                <div className="mt-1 flex justify-between text-xs text-mist">
                  <span>{league.memberCount} {league.memberCount === 1 ? "spiller" : "spillere"}</span>
                  <span>{league.isOwner ? "Du er eier" : "Eier: " + league.ownerUsername}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-mist">Du er ikke med i noen venneliga ennå.</p>
        )}
      </section>

      {props.selected && (
        <section className="card overflow-hidden">
          <div className="border-b border-line p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-3xl font-bold">{props.selected.name}</h2>
                <p className="text-sm text-mist">Samme månedspoeng som den åpne Tippetuppen-ligaen.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" type="button" onClick={props.onShare}>Del liga</button>
                <button className="btn btn-secondary" type="button" onClick={props.onCopyCode}>Kopier kode</button>
              </div>
            </div>
            <div className="mt-4 inline-flex items-center gap-3 rounded-xl border border-line px-4 py-2">
              <span className="text-xs uppercase tracking-widest text-mist">Kode</span>
              <strong className="font-display text-2xl tracking-[0.2em] text-gold">{props.selected.code}</strong>
            </div>
          </div>

          {props.selected.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-mist">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Spiller</th>
                    <th className="p-3 text-right">Poeng</th>
                    <th className="p-3 text-right">Spill</th>
                    {props.selected.isOwner && <th className="p-3 text-right">Eier</th>}
                  </tr>
                </thead>
                <tbody>
                  {props.selected.rows.map((row) => (
                    <tr
                      key={row.userId}
                      className={`border-t border-line ${row.userId === props.user?.id ? "bg-sky/10 font-bold" : ""}`}
                    >
                      <td className="p-3 font-display text-lg">{row.rank}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <ProfileAvatar avatarId={row.avatarId} size={34} />
                          <span className="break-all">{row.username}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-display text-xl text-gold">{row.points}</td>
                      <td className="p-3 text-right text-mist">{row.played}</td>
                      {props.selected?.isOwner && (
                        <td className="p-3 text-right">
                          {row.userId !== props.user?.id && (
                            <button className="text-xs text-mist underline" type="button" onClick={() => props.onKick(row)}>
                              Fjern
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-mist">Ingen spillere i ligaen ennå.</p>
          )}

          <div className="border-t border-line p-5">
            {props.selected.isOwner ? (
              <div className="space-y-4">
                <form className="flex flex-col gap-2 sm:flex-row" onSubmit={props.onRename}>
                  <input
                    className="input flex-1"
                    value={props.renameName}
                    onChange={(e) => props.onRenameName(e.target.value)}
                    maxLength={40}
                    aria-label="Nytt liganavn"
                  />
                  <button className="btn btn-secondary" disabled={props.busy}>Endre navn</button>
                </form>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-secondary" type="button" onClick={props.onRegenerate} disabled={props.busy}>
                    Lag ny kode
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={props.onDelete} disabled={props.busy}>
                    Slett liga
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-secondary" type="button" onClick={props.onLeave} disabled={props.busy}>
                Forlat liga
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import {
  clearSession,
  saveSession,
  storedUser,
  updateStoredUser,
  type SessionUser,
} from "@/lib/auth";
import {
  AVATAR_UNLOCK_POINTS,
  PROFILE_AVATARS,
} from "@/lib/profileAvatars";
import { BASE_PATH } from "@/lib/site";
import { ProfileAvatar } from "./ProfileAvatar";

type Profile = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
  avatarId: number | null;
  totalPoints: number;
  totalGames: number;
  playedDays: number;
  lifetimeRank: number;
  avatarUnlocked: boolean;
  avatarAvailable: boolean;
  unlockAt: number;
};

type AuthResponse = {
  ok: boolean;
  token?: string;
  user?: SessionUser;
  error?: string;
};

type ProfileResponse = {
  ok: boolean;
  profile?: Profile;
  error?: string;
};

export function ProfileScreen() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarId, setAvatarId] = useState<number | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const applyProfile = useCallback((next: Profile) => {
    setProfile(next);
    setName(next.name ?? "");
    setEmail(next.email ?? "");
    setAvatarId(next.avatarId ?? null);
    const nextUser: SessionUser = {
      id: next.id,
      username: next.username,
      name: next.name,
      email: next.email,
      avatarId: next.avatarId,
    };
    setUser(nextUser);
    updateStoredUser(nextUser);
  }, []);

  const loadProfile = useCallback(async () => {
    const response = await apiGet<ProfileResponse>("/profile");
    if (!response.ok || !response.profile) throw new Error("profile unavailable");
    applyProfile(response.profile);
  }, [applyProfile]);

  useEffect(() => {
    const syncMode = () => setMode(window.location.hash === "#register" ? "register" : "login");
    syncMode();
    window.addEventListener("hashchange", syncMode);
    return () => window.removeEventListener("hashchange", syncMode);
  }, []);

  useEffect(() => {
    let active = true;
    const local = storedUser();
    setUser(local);

    (async () => {
      try {
        if (!local) return;
        const me = await apiGet<{ ok: boolean; user?: SessionUser }>("/auth/me");
        if (!active) return;
        if (!me.ok || !me.user) {
          clearSession();
          setUser(null);
          return;
        }
        updateStoredUser(me.user);
        setUser(me.user);
        await loadProfile();
      } catch {
        if (active) setMessage("Kunne ikke hente profilen akkurat nå.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    if (!local) setLoading(false);
    return () => { active = false; };
  }, [loadProfile]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPost<AuthResponse>(`/auth/${mode}`, {
        username: authUsername,
        password: authPassword,
      });
      if (!response.ok || !response.token || !response.user) {
        setMessage(
          response.error === "taken"
            ? "Brukernavnet er allerede tatt."
            : response.error === "rate-limit"
              ? "For mange forsøk. Vent litt og prøv igjen."
              : mode === "register"
                ? "Bruk 3–24 tegn i brukernavnet og minst 8 tegn i passordet."
                : "Feil brukernavn eller passord.",
        );
        return;
      }
      saveSession(response.token, response.user);
      setUser(response.user);
      setAuthPassword("");
      await loadProfile();
      const join = new URLSearchParams(window.location.search).get("join");
      if (join) {
        window.location.assign(BASE_PATH + "/liga/?join=" + encodeURIComponent(join));
        return;
      }
      setMessage(mode === "register" ? "Spiller opprettet." : "Du er logget inn.");
    } catch {
      setMessage("Fikk ikke kontakt med Tippetuppen. Prøv igjen.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await apiPost<ProfileResponse>("/profile/update", {
        name,
        email,
        avatarId,
      });
      if (!response.ok || !response.profile) {
        setMessage(
          response.error === "email-taken"
            ? "Denne e-postadressen brukes allerede av en annen profil."
            : response.error === "avatar-locked"
              ? "Avatarer låses opp når du passerer 2 000 totalpoeng."
              : "Kunne ikke lagre profilen. Sjekk feltene og prøv igjen.",
        );
        return;
      }
      applyProfile(response.profile);
      setMessage("Profilen er lagret.");
    } catch {
      setMessage("Kunne ikke lagre profilen akkurat nå.");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setPasswordMessage("");
    try {
      const response = await apiPost<AuthResponse>("/profile/password", {
        currentPassword,
        newPassword,
      });
      if (!response.ok || !response.token || !response.user) {
        setPasswordMessage(
          response.error === "current-password"
            ? "Nåværende passord er feil."
            : "Nytt passord må være minst 8 tegn.",
        );
        return;
      }
      saveSession(response.token, response.user);
      setUser(response.user);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Passordet er endret. Andre innlogginger er logget ut.");
    } catch {
      setPasswordMessage("Kunne ikke endre passord akkurat nå.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await apiPost("/auth/logout", {});
    } catch {
      // Clear the local session even if the network is temporarily unavailable.
    } finally {
      clearSession();
      setUser(null);
      setProfile(null);
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-mist" role="status">Henter profilen …</p>;
  }

  if (!user || !profile) {
    return (
      <div className="flex flex-col gap-5">
        <section>
          <h1 className="font-display text-4xl font-bold uppercase">Min profil</h1>
          <p className="mt-2 text-mist">Logg inn for å lagre poeng, delta i ligaer og bygge Tippetuppen-profilen din.</p>
        </section>
        <section className="card p-5">
          <div className="mb-4 flex gap-2">
            <button
              className={`btn ${mode === "login" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setMode("login"); window.location.hash = "login"; }}
            >
              Logg inn
            </button>
            <button
              className={`btn ${mode === "register" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setMode("register"); window.location.hash = "register"; }}
            >
              Ny spiller
            </button>
          </div>
          <form className="space-y-3" onSubmit={submitAuth}>
            <label className="block">
              <span className="mb-1 block text-sm text-mist">Brukernavn</span>
              <input
                className="input"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                autoComplete="username"
                placeholder="Unikt brukernavn"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-mist">Passord</span>
              <input
                className="input"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="Minst 8 tegn"
              />
            </label>
            <button className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Venter …" : mode === "login" ? "Logg inn" : "Opprett spiller"}
            </button>
          </form>
          {message && <p className="mt-3 text-sm text-mist">{message}</p>}
        </section>
      </div>
    );
  }

  const progress = Math.min(100, Math.round((profile.totalPoints / AVATAR_UNLOCK_POINTS) * 100));
  const pointsLeft = Math.max(0, AVATAR_UNLOCK_POINTS - profile.totalPoints);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h1 className="font-display text-4xl font-bold uppercase">Min profil</h1>
        <p className="mt-2 text-mist">Din spilleridentitet, progresjon og innstillinger.</p>
      </section>

      {profile.avatarAvailable && (
        <section className="card border-gold p-5">
          <div className="font-display text-2xl font-bold text-gold">🎉 Avatarer låst opp!</div>
          <p className="mt-1 text-sm text-mist">
            Du har passert 2 000 totalpoeng. Velg en profilavatar nedenfor – den vises i Tippetuppen-ligaen og venneligaene.
          </p>
        </section>
      )}

      <section className="card p-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar avatarId={profile.avatarId} size={76} />
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-widest text-mist">Spiller</div>
            <div className="truncate font-display text-3xl font-bold">{profile.username}</div>
            <div className="mt-1 text-sm text-mist">{profile.name || "Legg til navn på profilen"}</div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Totalpoeng" value={profile.totalPoints.toLocaleString("nb-NO")} accent />
          <Stat label="Plass totalt" value={"#" + profile.lifetimeRank.toLocaleString("nb-NO")} />
          <Stat label="Spill" value={profile.totalGames.toLocaleString("nb-NO")} />
          <Stat label="Spilledager" value={profile.playedDays.toLocaleString("nb-NO")} />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Profilavatar</h2>
        {profile.avatarUnlocked ? (
          <>
            <p className="mt-1 text-sm text-mist">Velg en avatar. Du kan bytte når du vil.</p>
            <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {PROFILE_AVATARS.map((avatar) => (
                <button
                  type="button"
                  key={avatar.id}
                  className={`rounded-xl border p-2 transition ${avatarId === avatar.id ? "border-gold bg-gold/10" : "border-line hover:border-sky"}`}
                  onClick={() => setAvatarId(avatar.id)}
                  aria-pressed={avatarId === avatar.id}
                  title={avatar.label}
                >
                  <ProfileAvatar avatarId={avatar.id} size={72} className="mx-auto" />
                  <span className="mt-2 block truncate text-xs text-mist">{avatar.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-mist">
              Profilavatar låses opp ved 2 000 totalpoeng. Du mangler {pointsLeft.toLocaleString("nb-NO")} poeng.
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-gold" style={{ width: progress + "%" }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-mist">
              <span>{profile.totalPoints.toLocaleString("nb-NO")} poeng</span>
              <span>2 000</span>
            </div>
          </>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Profilopplysninger</h2>
        <p className="mt-1 text-sm text-mist">Navn og e-post er private. Bare brukernavnet og avataren vises i ligaene.</p>
        <form className="mt-4 space-y-3" onSubmit={saveProfile}>
          <label className="block">
            <span className="mb-1 block text-sm text-mist">Brukernavn</span>
            <input className="input opacity-70" value={profile.username} readOnly />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-mist">Navn</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Valgfritt"
              maxLength={60}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-mist">E-postadresse</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="Valgfritt"
              maxLength={160}
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>Lagre profil</button>
        </form>
        {message && <p className="mt-3 text-sm text-mist">{message}</p>}
      </section>

      <section className="card p-5">
        <h2 className="font-display text-2xl font-bold uppercase">Passord</h2>
        <p className="mt-1 text-sm text-mist">Endrer du passord, blir andre aktive innlogginger logget ut.</p>
        <form className="mt-4 space-y-3" onSubmit={changePassword}>
          <input
            className="input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Nåværende passord"
            autoComplete="current-password"
          />
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Nytt passord (minst 8 tegn)"
            autoComplete="new-password"
          />
          <button className="btn btn-secondary" disabled={busy}>Endre passord</button>
        </form>
        {passwordMessage && <p className="mt-3 text-sm text-mist">{passwordMessage}</p>}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/liga/" className="btn btn-primary">Gå til ligaene</Link>
        <button className="btn btn-secondary" onClick={logout} disabled={busy}>Logg ut</button>
      </section>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="text-xs uppercase tracking-wide text-mist">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${accent ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}

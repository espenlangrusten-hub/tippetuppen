import { login } from "../actions";
import { adminConfigured } from "@/server/adminAuth";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!adminConfigured())
    return (
      <div className="card p-5">
        <h1 className="font-display text-2xl font-bold uppercase">Admin er ikke konfigurert</h1>
        <p className="mt-2 text-sm text-mist">Sett ADMIN_PASSWORD og ADMIN_SESSION_SECRET (minst 16 tegn) i miljøvariablene for å aktivere administrasjon.</p>
      </div>
    );
  return (
    <form action={login} className="card mx-auto flex max-w-sm flex-col gap-3 p-5">
      <h1 className="font-display text-2xl font-bold uppercase">Admin</h1>
      {error && <p className="text-sm text-flag-2">Feil passord.</p>}
      <input className="input" type="password" name="password" placeholder="Passord" autoComplete="current-password" required />
      <button className="btn btn-primary" type="submit">
        Logg inn
      </button>
    </form>
  );
}

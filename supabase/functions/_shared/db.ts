// Postgres access for the Edge Function. Uses the pooled connection string from the
// SUPABASE_DB_URL secret so the function never needs the service-role key.
import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!client) {
    // SUPABASE_DB_URL is injected automatically and points at the direct connection.
    // Set DB_URL to the transaction pooler instead if the function ever runs hot enough
    // to need it: `supabase secrets set DB_URL=...`.
    const url = Deno.env.get("DB_URL") || Deno.env.get("SUPABASE_DB_URL");
    if (!url) throw new Error("Neither DB_URL nor SUPABASE_DB_URL is set for this function");
    // One connection per function instance: invocations are short and many instances
    // share Supabase's pooler, so a larger pool here only risks exhausting it.
    client = postgres(url, { max: Number(Deno.env.get("DB_POOL_MAX") ?? 1), prepare: false, idle_timeout: 20 });
  }
  return client;
}

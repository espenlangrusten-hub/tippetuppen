// Postgres access for the Edge Function. Uses the pooled connection string from the
// SUPABASE_DB_URL secret so the function never needs the service-role key.
import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function sql() {
  if (!client) {
    const url = Deno.env.get("SUPABASE_DB_URL");
    if (!url) throw new Error("SUPABASE_DB_URL is not set for this function");
    // One connection per function instance: invocations are short and many instances
    // share Supabase's pooler, so a larger pool here only risks exhausting it.
    client = postgres(url, { max: Number(Deno.env.get("DB_POOL_MAX") ?? 1), prepare: false, idle_timeout: 20 });
  }
  return client;
}

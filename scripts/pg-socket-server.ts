/**
 * Serves the local PGlite database over the Postgres wire protocol, so the Deno
 * Edge Function can be run and tested locally exactly as it runs on Supabase.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create(process.env.PGLITE_DIR ?? ".data/pglite");
await db.waitReady;
const server = new PGLiteSocketServer({ db, port: Number(process.env.PG_PORT ?? 5433), host: "127.0.0.1" });
await server.start();
console.log("PGLITE_SOCKET_READY");

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

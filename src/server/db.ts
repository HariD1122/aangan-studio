import "server-only";
import pg from "pg";

declare global {
  var __pool: pg.Pool | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Owner-level pool. Bypasses RLS: use ONLY for auth/user management after an explicit role check. */
export const pool: pg.Pool =
  globalThis.__pool ??
  (globalThis.__pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }));

/**
 * Runs `fn` in a transaction as the restricted `app_user` role with `app.user_id` set,
 * so PostgreSQL Row Level Security decides what this user may see and change.
 */
export async function withUser<T>(userId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    if (!UUID.test(userId)) throw new Error("invalid user id");
    // One round trip instead of three (Neon is a network hop away). userId is validated as a UUID above.
    await c.query(`begin; set local role app_user; select set_config('app.user_id', '${userId}', true);`);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
